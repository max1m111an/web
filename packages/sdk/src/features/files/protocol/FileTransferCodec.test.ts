import { describe, expect, it } from "vitest";
import {
  createFileTransferFrame,
  decodeFileTransferFrame,
  encodeFileTransferFrame,
  FILE_TRANSFER_MAX_FILE_SIZE,
  FileTransferStatus,
  FileTransferType,
  fileTransferCrc32,
} from "./FileTransferCodec.ts";

describe("fileTransferCrc32", () => {
  it("matches standard CRC-32", () => {
    const bytes = new TextEncoder().encode("123456789");

    expect(fileTransferCrc32(bytes)).toBe(0xcbf43926);
  });

  it("returns 0 for an empty buffer", () => {
    expect(fileTransferCrc32(new Uint8Array(0))).toBe(0);
  });
});

describe("encodeFileTransferFrame", () => {
  it("emits START field tags in firmware order", () => {
    const frame = createFileTransferFrame({
      type: FileTransferType.START,
      transferId: 0x1234,
      filename: "a.bin",
      fileSize: 5,
      crc32: 0xdeadbeef,
    });

    const bytes = encodeFileTransferFrame(frame);

    // field 1 (type) = varint 1, field 2 (transfer_id) = varint 0x1234.
    expect(bytes[0]).toBe(0x08);
    expect(bytes[1]).toBe(FileTransferType.START);
    expect(bytes[2]).toBe(0x10);
    expect(bytes[3]).toBe(0xb4);
    expect(bytes[4]).toBe(0x24);
    // field 3 (filename), length-delimited.
    expect(bytes[5]).toBe(0x1a);
    expect(bytes[6]).toBe(5);
  });

  it("omits zero-valued scalar fields", () => {
    const bytes = encodeFileTransferFrame(
      createFileTransferFrame({ type: FileTransferType.READY }),
    );

    expect(Array.from(bytes)).toEqual([0x08, FileTransferType.READY]);
  });
});

describe("decodeFileTransferFrame", () => {
  it("round-trips every field", () => {
    const frame = createFileTransferFrame({
      type: FileTransferType.CHUNK,
      transferId: 987654,
      filename: "photo.jpg",
      fileSize: FILE_TRANSFER_MAX_FILE_SIZE,
      offset: 180,
      data: Uint8Array.from([0, 1, 250, 255]),
      crc32: 0xcbf43926,
      status: FileTransferStatus.OK,
      message: "hello",
    });

    expect(decodeFileTransferFrame(encodeFileTransferFrame(frame))).toEqual(
      frame,
    );
  });

  it("decodes a frame containing only a type", () => {
    const decoded = decodeFileTransferFrame(
      Uint8Array.from([0x08, FileTransferType.ABORT]),
    );

    expect(decoded.type).toBe(FileTransferType.ABORT);
    expect(decoded.transferId).toBe(0);
    expect(decoded.data).toHaveLength(0);
  });

  it("skips unknown fields for forward compatibility", () => {
    const decoded = decodeFileTransferFrame(
      Uint8Array.from([
        0x08,
        FileTransferType.START,
        // field 10, varint
        0x50,
        0x05,
        // field 11, length-delimited
        0x5a,
        0x02,
        0xaa,
        0xbb,
      ]),
    );

    expect(decoded.type).toBe(FileTransferType.START);
  });

  it("throws on a truncated length-delimited field", () => {
    expect(() =>
      decodeFileTransferFrame(Uint8Array.from([0x1a, 0x05, 0x41])),
    ).toThrow(/truncated/i);
  });

  it("throws on an unterminated varint", () => {
    expect(() =>
      decodeFileTransferFrame(Uint8Array.from([0x08, 0x80])),
    ).toThrow(/truncated/i);
  });
});
