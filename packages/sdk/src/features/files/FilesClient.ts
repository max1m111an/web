import type * as Protobuf from "@meshtastic/protobufs";
import { Result } from "better-result";
import type { ResultType } from "better-result";
import type { MeshClient } from "../../core/client/MeshClient.ts";
import { Constants } from "../../core/constants/index.ts";
import { generatePacketId } from "../../core/identifiers/PacketId.ts";
import type { ReadonlySignal } from "../../core/signals/createStore.ts";
import type { PacketMetadata } from "../../core/types.ts";
import type { FileTransfer, FileTransferEvent } from "./domain/FileTransfer.ts";
import {
  sanitizeFileName,
  truncateToUtf8Bytes,
} from "./domain/FileMessageEnvelope.ts";
import {
  createFileTransferFrame,
  decodeFileTransferFrame,
  encodeFileTransferFrame,
  FILE_TRANSFER_ACK_TIMEOUT_MS,
  FILE_TRANSFER_CHUNK_SIZE,
  FILE_TRANSFER_MAX_FILENAME_BYTES,
  FILE_TRANSFER_MAX_FILE_SIZE,
  FILE_TRANSFER_MAX_RETRIES,
  FILE_TRANSFER_PORTNUM,
  fileTransferCrc32,
  type FileTransferFrame,
  FileTransferStatus,
  FileTransferType,
} from "./protocol/FileTransferCodec.ts";
import { FilesStore } from "./state/filesStore.ts";

const FILE_TRANSFER_PORT =
  FILE_TRANSFER_PORTNUM as unknown as Protobuf.Portnums.PortNum;

export type FileTransferErrorCode =
  | "empty"
  | "too_large"
  | "invalid_peer"
  | "busy"
  | "timeout"
  | "aborted"
  | "send_failed"
  | "checksum_mismatch";

export class FileTransferError extends Error {
  readonly _tag = "FileTransferError";

  constructor(
    readonly code: FileTransferErrorCode,
    message: string,
    readonly status?: FileTransferStatus,
  ) {
    super(message);
    this.name = "FileTransferError";
  }
}

interface OutboundTransfer {
  transferId: number;
  peer: number;
  filename: string;
  data: Uint8Array;
  size: number;
  crc32: number;
  offset: number;
  state: "wait_ready" | "wait_ack" | "wait_complete";
  retries: number;
  /** Monotonic id of the latest transmission, used to ignore stale failures. */
  transmitSeq: number;
  frame: FileTransferFrame;
  timer: ReturnType<typeof setTimeout> | undefined;
  resolve: (result: ResultType<FileTransfer, FileTransferError>) => void;
}

interface InboundTransfer {
  key: string;
  transferId: number;
  peer: number;
  filename: string;
  size: number;
  received: number;
  buffer: Uint8Array;
  startCrc: number;
}

/**
 * File slice. Owns two independent paths:
 *
 * - XModem `upload`/`download` (serial link to the radio).
 * - Mesh file transfer over `FILE_TRANSFER_APP` (firmware FileTransferModule
 *   protocol).
 *
 * For mesh sends this client is the stop-and-wait sender. For mesh receives it
 * is a passive assembler: the radio answers READY/ACK/COMPLETE, so the web app
 * only stores the START/CHUNK frames forwarded to it and never sends control
 * frames itself.
 */
export class FilesClient {
  private readonly client: MeshClient;
  private readonly store: FilesStore;
  private readonly inbound = new Map<string, InboundTransfer>();
  private readonly recentlyCompleted = new Set<string>();
  private outbound: OutboundTransfer | null = null;

  public readonly transfers: ReadonlySignal<ReadonlyArray<FileTransfer>>;

  constructor(client: MeshClient) {
    this.client = client;
    this.store = new FilesStore();
    this.transfers = this.store.read;

    client.events.onFileTransferPacket.subscribe((packet) => {
      this.handleFrame(packet);
    });
  }

  /**
   * Sends a file to a peer using the firmware file-transfer protocol.
   * Only direct chats are supported.
   */
  public sendFile(
    peer: number,
    filename: string,
    data: Uint8Array,
  ): Promise<ResultType<FileTransfer, FileTransferError>> {
    if (
      !Number.isFinite(peer) ||
      peer <= 0 ||
      peer === Constants.broadcastNum
    ) {
      return Promise.resolve(
        Result.err(
          new FileTransferError(
            "invalid_peer",
            "File transfers are only supported in direct chats",
          ),
        ),
      );
    }
    if (data.length === 0) {
      return Promise.resolve(
        Result.err(new FileTransferError("empty", "File is empty")),
      );
    }
    if (data.length > FILE_TRANSFER_MAX_FILE_SIZE) {
      return Promise.resolve(
        Result.err(
          new FileTransferError(
            "too_large",
            `File is too large (max ${FILE_TRANSFER_MAX_FILE_SIZE} bytes)`,
          ),
        ),
      );
    }
    if (this.outbound) {
      return Promise.resolve(
        Result.err(
          new FileTransferError(
            "busy",
            "Another file transfer is already in progress",
          ),
        ),
      );
    }

    const transferId = generateTransferId();
    const bytes = Uint8Array.from(data);
    const safeName = truncateToUtf8Bytes(
      sanitizeFileName(filename),
      FILE_TRANSFER_MAX_FILENAME_BYTES,
    );
    const crc = fileTransferCrc32(bytes);
    const transfer: FileTransfer = {
      id: transferId,
      filename: safeName,
      direction: "send",
      status: "in_progress",
      size: bytes.length,
      transferred: 0,
      peer,
      crc32: crc,
    };
    this.store.set(transferId, transfer);
    this.dispatch({
      id: transferId,
      filename: safeName,
      direction: "send",
      peer,
      size: bytes.length,
      transferred: 0,
      status: "in_progress",
    });

    return new Promise<ResultType<FileTransfer, FileTransferError>>(
      (resolve) => {
        const outbound: OutboundTransfer = {
          transferId,
          peer,
          filename: safeName,
          data: bytes,
          size: bytes.length,
          crc32: crc,
          offset: 0,
          state: "wait_ready",
          retries: 0,
          transmitSeq: 0,
          frame: createFileTransferFrame({
            type: FileTransferType.START,
            transferId,
            filename: safeName,
            fileSize: bytes.length,
            crc32: crc,
          }),
          timer: undefined,
          resolve,
        };
        this.outbound = outbound;
        this.transmitFrame(outbound);
        this.armOutboundTimer(outbound);
      },
    );
  }

  public async upload(
    filename: string,
    data: Uint8Array,
  ): Promise<ResultType<FileTransfer, Error>> {
    const id = generatePacketId();
    const transfer: FileTransfer = {
      id,
      filename,
      direction: "upload",
      status: "in_progress",
      size: data.length,
    };
    this.store.set(id, transfer);
    try {
      await this.client.xModem.uploadFile(filename, data);
      const done: FileTransfer = { ...transfer, status: "complete" };
      this.store.set(id, done);
      return Result.ok(done);
    } catch (e) {
      const failed: FileTransfer = { ...transfer, status: "failed" };
      this.store.set(id, failed);
      return Result.err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  public async download(
    filename: string,
  ): Promise<ResultType<FileTransfer, Error>> {
    const id = generatePacketId();
    const transfer: FileTransfer = {
      id,
      filename,
      direction: "download",
      status: "in_progress",
    };
    this.store.set(id, transfer);
    try {
      await this.client.xModem.downloadFile(filename);
      const done: FileTransfer = { ...transfer, status: "complete" };
      this.store.set(id, done);
      return Result.ok(done);
    } catch (e) {
      const failed: FileTransfer = { ...transfer, status: "failed" };
      this.store.set(id, failed);
      return Result.err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  private handleFrame(packet: PacketMetadata<FileTransferFrame>): void {
    if (packet.from === this.client.myNodeNum) return;

    const frame = packet.data;
    if (!frame) return;

    const isControl =
      frame.type === FileTransferType.READY ||
      frame.type === FileTransferType.ACK ||
      frame.type === FileTransferType.COMPLETE ||
      frame.type === FileTransferType.FAILURE ||
      frame.type === FileTransferType.ABORT;

    if (
      isControl &&
      this.outbound &&
      packet.from === this.outbound.peer &&
      frame.transferId === this.outbound.transferId
    ) {
      this.handleOutboundControl(this.outbound, frame);
      return;
    }

    if (frame.type === FileTransferType.START) {
      this.handleInboundStart(packet.from, frame);
    } else if (frame.type === FileTransferType.CHUNK) {
      this.handleInboundChunk(packet.from, frame);
    }
  }

  private handleOutboundControl(
    outbound: OutboundTransfer,
    frame: FileTransferFrame,
  ): void {
    switch (frame.type) {
      case FileTransferType.READY: {
        if (outbound.state !== "wait_ready") return;
        this.clearOutboundTimer(outbound);
        outbound.offset = 0;
        outbound.retries = 0;
        outbound.state = "wait_ack";
        this.sendCurrentChunk(outbound);
        return;
      }
      case FileTransferType.ACK: {
        if (outbound.state !== "wait_ack") return;
        const chunkSize = Math.min(
          FILE_TRANSFER_CHUNK_SIZE,
          outbound.size - outbound.offset,
        );
        const expectedOffset = outbound.offset + chunkSize;
        if (
          frame.offset !== expectedOffset ||
          expectedOffset >= outbound.size
        ) {
          return;
        }
        this.clearOutboundTimer(outbound);
        outbound.offset = expectedOffset;
        outbound.retries = 0;
        this.sendCurrentChunk(outbound);
        return;
      }
      case FileTransferType.COMPLETE: {
        this.finishOutboundSuccess(outbound);
        return;
      }
      case FileTransferType.FAILURE: {
        this.finishOutboundFailure(
          outbound,
          new FileTransferError(
            frame.status === FileTransferStatus.CHECKSUM_MISMATCH
              ? "checksum_mismatch"
              : "send_failed",
            frame.message || `Peer rejected the file (status ${frame.status})`,
            frame.status,
          ),
        );
        return;
      }
      case FileTransferType.ABORT: {
        this.finishOutboundFailure(
          outbound,
          new FileTransferError("aborted", "File transfer was aborted"),
        );
        return;
      }
      default:
        return;
    }
  }

  private handleInboundStart(peer: number, frame: FileTransferFrame): void {
    if (
      frame.fileSize === 0 ||
      frame.fileSize > FILE_TRANSFER_MAX_FILE_SIZE ||
      frame.filename.length === 0
    ) {
      return;
    }

    const key = inboundKey(peer, frame.transferId);
    if (this.inbound.has(key) || this.recentlyCompleted.has(key)) {
      return;
    }

    const transfer: FileTransfer = {
      id: frame.transferId,
      filename: sanitizeFileName(frame.filename),
      direction: "receive",
      status: "in_progress",
      size: frame.fileSize,
      transferred: 0,
      peer,
    };
    const inbound: InboundTransfer = {
      key,
      transferId: frame.transferId,
      peer,
      filename: transfer.filename,
      size: frame.fileSize,
      received: 0,
      buffer: new Uint8Array(frame.fileSize),
      startCrc: frame.crc32,
    };

    this.inbound.set(key, inbound);
    this.store.set(transfer.id, transfer);
    this.dispatch({
      id: transfer.id,
      filename: transfer.filename,
      direction: "receive",
      peer,
      size: transfer.size ?? frame.fileSize,
      transferred: 0,
      status: "in_progress",
    });
  }

  private handleInboundChunk(peer: number, frame: FileTransferFrame): void {
    const inbound = this.inbound.get(inboundKey(peer, frame.transferId));
    if (!inbound) return;

    if (frame.data.length === 0) {
      this.failInbound(
        inbound,
        new FileTransferError(
          "send_failed",
          "Peer sent an empty chunk",
          FileTransferStatus.INVALID_REQUEST,
        ),
      );
      return;
    }

    // The radio already ACKed the offset; duplicate/out-of-order frames are
    // simply ignored here until the expected chunk arrives.
    if (frame.offset !== inbound.received) return;

    if (inbound.received + frame.data.length > inbound.size) {
      this.failInbound(
        inbound,
        new FileTransferError(
          "too_large",
          "Received chunk exceeds the announced file size",
          FileTransferStatus.TOO_LARGE,
        ),
      );
      return;
    }

    inbound.buffer.set(frame.data, inbound.received);
    inbound.received += frame.data.length;
    this.updateTransfer(inbound.transferId, {
      transferred: inbound.received,
    });

    if (inbound.received < inbound.size) return;

    const computedCrc = fileTransferCrc32(inbound.buffer);
    const expectedCrc = frame.crc32 || inbound.startCrc;
    if (expectedCrc !== 0 && expectedCrc !== computedCrc) {
      this.failInbound(
        inbound,
        new FileTransferError(
          "checksum_mismatch",
          "Received file failed its CRC check",
          FileTransferStatus.CHECKSUM_MISMATCH,
        ),
      );
      return;
    }

    const data = inbound.buffer.slice();
    this.inbound.delete(inbound.key);
    this.rememberCompleted(inbound.key);

    const done: FileTransfer = {
      id: inbound.transferId,
      filename: inbound.filename,
      direction: "receive",
      status: "complete",
      size: inbound.size,
      transferred: inbound.size,
      peer: inbound.peer,
      crc32: computedCrc,
      data,
    };
    this.store.set(done.id, done);
    this.dispatch({
      id: done.id,
      filename: done.filename,
      direction: "receive",
      peer: inbound.peer,
      size: inbound.size,
      transferred: inbound.size,
      status: "complete",
      crc32: computedCrc,
      data,
    });
  }

  private sendCurrentChunk(outbound: OutboundTransfer): void {
    if (outbound.offset >= outbound.size) return;

    const chunkSize = Math.min(
      FILE_TRANSFER_CHUNK_SIZE,
      outbound.size - outbound.offset,
    );
    const isFinal = outbound.offset + chunkSize >= outbound.size;

    outbound.frame = createFileTransferFrame({
      type: FileTransferType.CHUNK,
      transferId: outbound.transferId,
      offset: outbound.offset,
      data: outbound.data.subarray(
        outbound.offset,
        outbound.offset + chunkSize,
      ),
      crc32: isFinal ? outbound.crc32 : 0,
    });
    outbound.state = isFinal ? "wait_complete" : "wait_ack";

    this.updateTransfer(outbound.transferId, {
      transferred: outbound.offset,
    });
    this.transmitFrame(outbound);
    this.armOutboundTimer(outbound);
  }

  private transmitFrame(outbound: OutboundTransfer): void {
    const payload = encodeFileTransferFrame(outbound.frame);
    const seq = (outbound.transmitSeq += 1);
    void this.client
      .sendPacket(
        payload,
        FILE_TRANSFER_PORT,
        outbound.peer,
        0,
        true,
        false,
        false,
      )
      .catch((error: unknown) => {
        // A retry may have superseded this transmission; only the latest one
        // may fail the transfer.
        if (this.outbound !== outbound || outbound.transmitSeq !== seq) return;
        this.finishOutboundFailure(
          outbound,
          new FileTransferError(
            "send_failed",
            error instanceof Error ? error.message : String(error),
          ),
        );
      });
  }

  private armOutboundTimer(outbound: OutboundTransfer): void {
    this.clearOutboundTimer(outbound);
    outbound.timer = setTimeout(() => {
      if (this.outbound !== outbound) return;
      if (outbound.retries >= FILE_TRANSFER_MAX_RETRIES) {
        this.finishOutboundFailure(
          outbound,
          new FileTransferError("timeout", "File transfer timed out"),
        );
        return;
      }
      outbound.retries += 1;
      this.transmitFrame(outbound);
      this.armOutboundTimer(outbound);
    }, FILE_TRANSFER_ACK_TIMEOUT_MS);
  }

  private clearOutboundTimer(outbound: OutboundTransfer): void {
    if (outbound.timer !== undefined) {
      clearTimeout(outbound.timer);
      outbound.timer = undefined;
    }
  }

  private finishOutboundSuccess(outbound: OutboundTransfer): void {
    this.clearOutboundTimer(outbound);
    if (this.outbound === outbound) this.outbound = null;

    const done: FileTransfer = {
      id: outbound.transferId,
      filename: outbound.filename,
      direction: "send",
      status: "complete",
      size: outbound.size,
      transferred: outbound.size,
      peer: outbound.peer,
      crc32: outbound.crc32,
      data: outbound.data,
    };
    this.store.set(done.id, done);
    this.dispatch({
      id: done.id,
      filename: done.filename,
      direction: "send",
      peer: outbound.peer,
      size: outbound.size,
      transferred: outbound.size,
      status: "complete",
      crc32: outbound.crc32,
      data: outbound.data,
    });
    outbound.resolve(Result.ok(done));
  }

  private finishOutboundFailure(
    outbound: OutboundTransfer,
    error: FileTransferError,
  ): void {
    this.clearOutboundTimer(outbound);
    if (this.outbound === outbound) this.outbound = null;

    const failed: FileTransfer = {
      id: outbound.transferId,
      filename: outbound.filename,
      direction: "send",
      status: "failed",
      size: outbound.size,
      transferred: outbound.offset,
      peer: outbound.peer,
      crc32: outbound.crc32,
      error: error.message,
    };
    this.store.set(failed.id, failed);
    this.dispatch({
      id: failed.id,
      filename: failed.filename,
      direction: "send",
      peer: outbound.peer,
      size: outbound.size,
      transferred: outbound.offset,
      status: "failed",
      error: error.message,
    });
    outbound.resolve(Result.err(error));
  }

  private failInbound(
    inbound: InboundTransfer,
    error: FileTransferError,
  ): void {
    this.inbound.delete(inbound.key);
    const failed: FileTransfer = {
      id: inbound.transferId,
      filename: inbound.filename,
      direction: "receive",
      status: "failed",
      size: inbound.size,
      transferred: inbound.received,
      peer: inbound.peer,
      error: error.message,
    };
    this.store.set(failed.id, failed);
    this.dispatch({
      id: failed.id,
      filename: failed.filename,
      direction: "receive",
      peer: inbound.peer,
      size: inbound.size,
      transferred: inbound.received,
      status: "failed",
      error: error.message,
    });
  }

  private updateTransfer(id: number, patch: Partial<FileTransfer>): void {
    const current = this.store.get(id);
    if (!current) return;
    this.store.set(id, { ...current, ...patch });
  }

  private dispatch(event: FileTransferEvent): void {
    if (event.status === "in_progress") {
      this.client.events.onFileTransferStarted.dispatch(event);
    } else if (event.status === "complete") {
      this.client.events.onFileTransferCompleted.dispatch(event);
    } else if (event.status === "failed") {
      this.client.events.onFileTransferFailed.dispatch(event);
    }
  }

  private rememberCompleted(key: string): void {
    this.recentlyCompleted.add(key);
    if (this.recentlyCompleted.size > 64) {
      const oldest = this.recentlyCompleted.values().next().value;
      if (oldest !== undefined) this.recentlyCompleted.delete(oldest);
    }
  }
}

function generateTransferId(): number {
  const seed = crypto.getRandomValues(new Uint32Array(1));
  return seed[0] || 1;
}

function inboundKey(peer: number, transferId: number): string {
  return `${peer}:${transferId}`;
}

// Re-exported for advanced consumers that need to decode raw frames themselves.
export { decodeFileTransferFrame };
