import { describe, expect, it, vi } from "vitest";
import { MeshClient } from "../../core/client/MeshClient.ts";
import { Constants } from "../../core/constants/index.ts";
import { createFakeTransport } from "../../core/testing/createFakeTransport.ts";
import {
  createFileTransferFrame,
  decodeFileTransferFrame,
  FILE_TRANSFER_CHUNK_SIZE,
  FILE_TRANSFER_MAX_FILE_SIZE,
  FileTransferStatus,
  FileTransferType,
  fileTransferCrc32,
} from "./protocol/FileTransferCodec.ts";
import type { FileTransferFrame } from "./protocol/FileTransferCodec.ts";

const PEER = 12345;

function makeClient() {
  const { transport } = createFakeTransport();
  return new MeshClient({ transport });
}

function dispatchFrame(
  client: MeshClient,
  from: number,
  frame: FileTransferFrame,
): void {
  client.events.onFileTransferPacket.dispatch({
    id: 1,
    rxTime: new Date(),
    type: "direct",
    from,
    to: client.myNodeNum,
    channel: 0,
    data: frame,
  });
}

describe("FilesClient.sendFile validation", () => {
  it("rejects broadcast destinations", async () => {
    const client = makeClient();

    const result = await client.files.sendFile(
      Constants.broadcastNum,
      "a.bin",
      Uint8Array.from([1]),
    );

    expect(result.status).toBe("error");
    if (result.status === "error")
      expect(result.error.code).toBe("invalid_peer");
  });

  it("rejects empty files", async () => {
    const client = makeClient();

    const result = await client.files.sendFile(
      PEER,
      "a.bin",
      new Uint8Array(0),
    );

    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.error.code).toBe("empty");
  });

  it("rejects files above the firmware limit", async () => {
    const client = makeClient();

    const result = await client.files.sendFile(
      PEER,
      "a.bin",
      new Uint8Array(FILE_TRANSFER_MAX_FILE_SIZE + 1),
    );

    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.error.code).toBe("too_large");
  });
});

describe("FilesClient.sendFile stop-and-wait", () => {
  it("drives START → CHUNK → ACK → COMPLETE against the firmware state machine", async () => {
    const client = makeClient();
    const sendSpy = vi.spyOn(client, "sendPacket").mockResolvedValue(1);
    const data = new Uint8Array(FILE_TRANSFER_CHUNK_SIZE + 20).fill(7);
    const crc = fileTransferCrc32(data);

    const pending = client.files.sendFile(PEER, "test.bin", data);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const startFrame = decodeFileTransferFrame(
      sendSpy.mock.calls[0]![0] as Uint8Array,
    );
    expect(startFrame.type).toBe(FileTransferType.START);
    expect(startFrame.filename).toBe("test.bin");
    expect(startFrame.fileSize).toBe(data.byteLength);
    expect(startFrame.crc32).toBe(crc);
    expect(startFrame.transferId).toBeGreaterThan(0);

    // Firmware resets the sender and asks for the first chunk.
    dispatchFrame(
      client,
      PEER,
      createFileTransferFrame({
        type: FileTransferType.READY,
        transferId: startFrame.transferId,
      }),
    );

    expect(sendSpy).toHaveBeenCalledTimes(2);
    const firstChunk = decodeFileTransferFrame(
      sendSpy.mock.calls[1]![0] as Uint8Array,
    );
    expect(firstChunk.type).toBe(FileTransferType.CHUNK);
    expect(firstChunk.offset).toBe(0);
    expect(firstChunk.data).toHaveLength(FILE_TRANSFER_CHUNK_SIZE);
    expect(firstChunk.crc32).toBe(0);

    // Only an ACK for offset + chunkSize advances the sender.
    dispatchFrame(
      client,
      PEER,
      createFileTransferFrame({
        type: FileTransferType.ACK,
        transferId: startFrame.transferId,
        offset: FILE_TRANSFER_CHUNK_SIZE,
      }),
    );

    expect(sendSpy).toHaveBeenCalledTimes(3);
    const finalChunk = decodeFileTransferFrame(
      sendSpy.mock.calls[2]![0] as Uint8Array,
    );
    expect(finalChunk.offset).toBe(FILE_TRANSFER_CHUNK_SIZE);
    expect(finalChunk.data).toHaveLength(20);
    expect(finalChunk.crc32).toBe(crc);

    // Firmware validates the CRC and only then reports COMPLETE.
    dispatchFrame(
      client,
      PEER,
      createFileTransferFrame({
        type: FileTransferType.COMPLETE,
        transferId: startFrame.transferId,
        status: FileTransferStatus.OK,
      }),
    );

    const result = await pending;
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.value.status).toBe("complete");
      expect(result.value.direction).toBe("send");
      expect(result.value.peer).toBe(PEER);
      expect(result.value.transferred).toBe(data.byteLength);
    }
  });

  it("does not advance on an ACK with the wrong offset", async () => {
    const client = makeClient();
    const sendSpy = vi.spyOn(client, "sendPacket").mockResolvedValue(1);
    const data = new Uint8Array(400).fill(1);

    const pending = client.files.sendFile(PEER, "test.bin", data);
    const transferId = decodeFileTransferFrame(
      sendSpy.mock.calls[0]![0] as Uint8Array,
    ).transferId;

    dispatchFrame(
      client,
      PEER,
      createFileTransferFrame({
        type: FileTransferType.READY,
        transferId,
      }),
    );
    const callsAfterFirstChunk = sendSpy.mock.calls.length;

    dispatchFrame(
      client,
      PEER,
      createFileTransferFrame({
        type: FileTransferType.ACK,
        transferId,
        offset: 10,
      }),
    );

    expect(sendSpy).toHaveBeenCalledTimes(callsAfterFirstChunk);

    // Finish so the pending promise does not leak.
    dispatchFrame(
      client,
      PEER,
      createFileTransferFrame({
        type: FileTransferType.ABORT,
        transferId,
      }),
    );
    const result = await pending;
    expect(result.status).toBe("error");
  });

  it("surfaces a firmware FAILURE frame", async () => {
    const client = makeClient();
    const sendSpy = vi.spyOn(client, "sendPacket").mockResolvedValue(1);

    const pending = client.files.sendFile(
      PEER,
      "test.bin",
      Uint8Array.from([1, 2, 3]),
    );
    const transferId = decodeFileTransferFrame(
      sendSpy.mock.calls[0]![0] as Uint8Array,
    ).transferId;

    dispatchFrame(
      client,
      PEER,
      createFileTransferFrame({
        type: FileTransferType.FAILURE,
        transferId,
        status: FileTransferStatus.NO_SPACE,
        message: "disk full",
      }),
    );

    const result = await pending;
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe("send_failed");
      expect(result.error.message).toBe("disk full");
    }
  });
});

describe("FilesClient inbound assembler", () => {
  it("assembles forwarded START/CHUNK frames without sending control frames", async () => {
    const client = makeClient();
    const sendSpy = vi.spyOn(client, "sendPacket").mockResolvedValue(1);
    const data = Uint8Array.from([10, 20, 30, 40]);
    const crc = fileTransferCrc32(data);
    const transferId = 4242;

    dispatchFrame(
      client,
      PEER,
      createFileTransferFrame({
        type: FileTransferType.START,
        transferId,
        filename: "in.bin",
        fileSize: data.byteLength,
        crc32: crc,
      }),
    );

    expect(client.files.transfers.value).toHaveLength(1);
    expect(client.files.transfers.value[0]?.status).toBe("in_progress");

    dispatchFrame(
      client,
      PEER,
      createFileTransferFrame({
        type: FileTransferType.CHUNK,
        transferId,
        offset: 0,
        data,
        crc32: crc,
      }),
    );

    const transfer = client.files.transfers.value[0];
    expect(transfer?.status).toBe("complete");
    expect(transfer?.direction).toBe("receive");
    expect(transfer?.peer).toBe(PEER);
    expect(transfer?.data).toEqual(data);

    // The radio owns READY/ACK/COMPLETE; the web client must stay silent.
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("ignores duplicate chunks and accepts out-of-order retransmits", async () => {
    const client = makeClient();
    const data = new Uint8Array(FILE_TRANSFER_CHUNK_SIZE * 2).fill(3);
    const crc = fileTransferCrc32(data);
    const transferId = 55;

    dispatchFrame(
      client,
      PEER,
      createFileTransferFrame({
        type: FileTransferType.START,
        transferId,
        filename: "big.bin",
        fileSize: data.byteLength,
        crc32: crc,
      }),
    );

    const first = data.subarray(0, FILE_TRANSFER_CHUNK_SIZE);
    dispatchFrame(
      client,
      PEER,
      createFileTransferFrame({
        type: FileTransferType.CHUNK,
        transferId,
        offset: 0,
        data: first,
      }),
    );
    // Duplicate of the same offset must not double-count.
    dispatchFrame(
      client,
      PEER,
      createFileTransferFrame({
        type: FileTransferType.CHUNK,
        transferId,
        offset: 0,
        data: first,
      }),
    );

    expect(client.files.transfers.value[0]?.transferred).toBe(
      FILE_TRANSFER_CHUNK_SIZE,
    );

    dispatchFrame(
      client,
      PEER,
      createFileTransferFrame({
        type: FileTransferType.CHUNK,
        transferId,
        offset: FILE_TRANSFER_CHUNK_SIZE,
        data: data.subarray(FILE_TRANSFER_CHUNK_SIZE),
        crc32: crc,
      }),
    );

    expect(client.files.transfers.value[0]?.status).toBe("complete");
  });

  it("fails the transfer when the CRC does not match", async () => {
    const client = makeClient();
    const data = Uint8Array.from([1, 2, 3]);

    dispatchFrame(
      client,
      PEER,
      createFileTransferFrame({
        type: FileTransferType.START,
        transferId: 66,
        filename: "bad.bin",
        fileSize: data.byteLength,
        crc32: 0x12345678,
      }),
    );
    dispatchFrame(
      client,
      PEER,
      createFileTransferFrame({
        type: FileTransferType.CHUNK,
        transferId: 66,
        offset: 0,
        data,
        crc32: 0x12345678,
      }),
    );

    const transfer = client.files.transfers.value[0];
    expect(transfer?.status).toBe("failed");
    expect(transfer?.error).toMatch(/crc/i);
  });
});
