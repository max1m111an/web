import crc32 from "crc/calculators/crc32";

/**
 * Port number used by the firmware's `FileTransferModule`
 * (`meshtastic_PortNum_FILE_TRANSFER_APP`).
 *
 * The vendored protobufs do not expose this port yet, so it is kept as a
 * local constant.
 */
export const FILE_TRANSFER_PORTNUM = 14;

export const FILE_TRANSFER_CHUNK_SIZE = 180;
export const FILE_TRANSFER_MAX_FILE_SIZE = 8192;
export const FILE_TRANSFER_MAX_FILENAME_BYTES = 63;
export const FILE_TRANSFER_ACK_TIMEOUT_MS = 15_000;
export const FILE_TRANSFER_MAX_RETRIES = 5;

/** Frame type from `meshtastic_FileTransferType`. */
export enum FileTransferType {
  UNSPECIFIED = 0,
  START = 1,
  READY = 2,
  CHUNK = 3,
  ACK = 4,
  COMPLETE = 5,
  FAILURE = 6,
  ABORT = 7,
}

/** Status from `meshtastic_FileTransferStatus`. */
export enum FileTransferStatus {
  UNSPECIFIED = 0,
  OK = 1,
  BUSY = 2,
  INVALID_REQUEST = 3,
  TOO_LARGE = 4,
  NO_SPACE = 5,
  IO_ERROR = 6,
  CHECKSUM_MISMATCH = 7,
  ABORTED = 8,
}

/**
 * Mirrors the wire shape of `meshtastic_FileTransferPacket`
 * (`src/mesh/generated/meshtastic/file_transfer.pb.h`).
 */
export interface FileTransferFrame {
  type: FileTransferType;
  transferId: number;
  filename: string;
  fileSize: number;
  offset: number;
  data: Uint8Array;
  crc32: number;
  status: FileTransferStatus;
  message: string;
}

export function createFileTransferFrame(
  init: Partial<FileTransferFrame> = {},
): FileTransferFrame {
  return {
    type: init.type ?? FileTransferType.UNSPECIFIED,
    transferId: init.transferId ?? 0,
    filename: init.filename ?? "",
    fileSize: init.fileSize ?? 0,
    offset: init.offset ?? 0,
    data: init.data ?? new Uint8Array(0),
    crc32: init.crc32 ?? 0,
    status: init.status ?? FileTransferStatus.UNSPECIFIED,
    message: init.message ?? "",
  };
}

const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_LENGTH_DELIMITED = 2;
const WIRE_FIXED32 = 5;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** Standard CRC-32 (same polynomial used by the firmware's ErriezCRC32). */
export function fileTransferCrc32(data: Uint8Array): number {
  return crc32(data) >>> 0;
}

/** Encodes a frame using the firmware's nanopb field tags. */
export function encodeFileTransferFrame(frame: FileTransferFrame): Uint8Array {
  const out: number[] = [];

  writeTag(out, 1, WIRE_VARINT);
  writeVarint(out, frame.type);

  if (frame.transferId !== 0) {
    writeTag(out, 2, WIRE_VARINT);
    writeVarint(out, frame.transferId);
  }
  if (frame.filename.length > 0) {
    writeBytes(out, 3, textEncoder.encode(frame.filename));
  }
  if (frame.fileSize !== 0) {
    writeTag(out, 4, WIRE_VARINT);
    writeVarint(out, frame.fileSize);
  }
  if (frame.offset !== 0) {
    writeTag(out, 5, WIRE_VARINT);
    writeVarint(out, frame.offset);
  }
  if (frame.data.length > 0) {
    writeBytes(out, 6, frame.data);
  }
  if (frame.crc32 !== 0) {
    writeTag(out, 7, WIRE_VARINT);
    writeVarint(out, frame.crc32);
  }
  if (frame.status !== FileTransferStatus.UNSPECIFIED) {
    writeTag(out, 8, WIRE_VARINT);
    writeVarint(out, frame.status);
  }
  if (frame.message.length > 0) {
    writeBytes(out, 9, textEncoder.encode(frame.message));
  }

  return Uint8Array.from(out);
}

/** Decodes a frame, skipping unknown fields for forward compatibility. */
export function decodeFileTransferFrame(bytes: Uint8Array): FileTransferFrame {
  const frame = createFileTransferFrame();
  let cursor = 0;

  while (cursor < bytes.length) {
    const tag = readVarint(bytes, cursor);
    cursor = tag.cursor;

    const field = Math.floor(tag.value / 8);
    const wireType = tag.value & 0x7;

    switch (field) {
      case 1: {
        const value = readVarint(bytes, cursor);
        cursor = value.cursor;
        frame.type = value.value as FileTransferType;
        break;
      }
      case 2: {
        const value = readVarint(bytes, cursor);
        cursor = value.cursor;
        frame.transferId = value.value >>> 0;
        break;
      }
      case 3: {
        const value = readLengthDelimited(bytes, cursor);
        cursor = value.cursor;
        frame.filename = textDecoder.decode(value.value);
        break;
      }
      case 4: {
        const value = readVarint(bytes, cursor);
        cursor = value.cursor;
        frame.fileSize = value.value >>> 0;
        break;
      }
      case 5: {
        const value = readVarint(bytes, cursor);
        cursor = value.cursor;
        frame.offset = value.value >>> 0;
        break;
      }
      case 6: {
        const value = readLengthDelimited(bytes, cursor);
        cursor = value.cursor;
        frame.data = value.value;
        break;
      }
      case 7: {
        const value = readVarint(bytes, cursor);
        cursor = value.cursor;
        frame.crc32 = value.value >>> 0;
        break;
      }
      case 8: {
        const value = readVarint(bytes, cursor);
        cursor = value.cursor;
        frame.status = value.value as FileTransferStatus;
        break;
      }
      case 9: {
        const value = readLengthDelimited(bytes, cursor);
        cursor = value.cursor;
        frame.message = textDecoder.decode(value.value);
        break;
      }
      default: {
        cursor = skipField(bytes, cursor, wireType);
      }
    }
  }

  return frame;
}

function writeTag(out: number[], field: number, wireType: number): void {
  writeVarint(out, (field << 3) | wireType);
}

function writeVarint(out: number[], input: number): void {
  let value = input >>> 0;
  while (value > 0x7f) {
    out.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  out.push(value);
}

function writeBytes(out: number[], field: number, value: Uint8Array): void {
  writeTag(out, field, WIRE_LENGTH_DELIMITED);
  writeVarint(out, value.length);
  for (const byte of value) out.push(byte);
}

function readVarint(
  bytes: Uint8Array,
  start: number,
): { value: number; cursor: number } {
  let value = 0;
  let shift = 0;
  let cursor = start;

  while (cursor < bytes.length) {
    const byte = bytes[cursor];
    if (byte === undefined) break;
    cursor += 1;

    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value: value >>> 0, cursor };
    }

    shift += 7;
    if (shift >= 35) {
      throw new Error("File transfer frame contains an invalid varint");
    }
  }

  throw new Error("File transfer frame is truncated");
}

function readLengthDelimited(
  bytes: Uint8Array,
  start: number,
): { value: Uint8Array; cursor: number } {
  const length = readVarint(bytes, start);
  const end = length.cursor + length.value;
  if (end > bytes.length) {
    throw new Error("File transfer frame is truncated");
  }
  return { value: bytes.subarray(length.cursor, end), cursor: end };
}

function skipField(bytes: Uint8Array, start: number, wireType: number): number {
  switch (wireType) {
    case WIRE_VARINT: {
      return readVarint(bytes, start).cursor;
    }
    case WIRE_FIXED64: {
      const cursor = start + 8;
      if (cursor > bytes.length) {
        throw new Error("File transfer frame is truncated");
      }
      return cursor;
    }
    case WIRE_LENGTH_DELIMITED: {
      return readLengthDelimited(bytes, start).cursor;
    }
    case WIRE_FIXED32: {
      const cursor = start + 4;
      if (cursor > bytes.length) {
        throw new Error("File transfer frame is truncated");
      }
      return cursor;
    }
    default: {
      throw new Error(
        `File transfer frame uses unsupported wire type ${wireType}`,
      );
    }
  }
}
