import { describe, expect, it } from "vitest";
import {
  buildFileMessageEnvelope,
  decodeBase64,
  encodeBase64,
  FILE_MESSAGE_PREFIX,
  parseFileMessage,
  sanitizeFileName,
  truncateToUtf8Bytes,
} from "./FileMessageEnvelope.ts";

describe("sanitizeFileName", () => {
  it("strips path components and invalid characters", () => {
    expect(sanitizeFileName("C:\\docs\\re:port?.pdf")).toBe("re_port_.pdf");
  });

  it("falls back to a default name", () => {
    expect(sanitizeFileName("   ")).toBe("file");
  });
});

describe("truncateToUtf8Bytes", () => {
  it("does not split multi-byte characters", () => {
    expect(truncateToUtf8Bytes("привет", 5)).toBe("пр");
  });
});

describe("base64", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = Uint8Array.from([0, 1, 2, 127, 128, 254, 255]);

    expect(decodeBase64(encodeBase64(bytes))).toEqual(bytes);
  });

  it("handles every padding length", () => {
    for (const length of [0, 1, 2, 3, 4, 5, 6]) {
      const bytes = Uint8Array.from({ length }, (_, i) => i * 37);
      expect(decodeBase64(encodeBase64(bytes))).toEqual(bytes);
    }
  });

  it("rejects malformed input", () => {
    expect(() => decodeBase64("abc")).toThrow(/invalid base64/i);
    expect(() => decodeBase64("a===")).toThrow(/invalid base64/i);
  });
});

describe("file message envelope", () => {
  it("builds a v1 envelope with base64 data", () => {
    const text = buildFileMessageEnvelope({
      id: 42,
      name: "notes.txt",
      size: 3,
      data: Uint8Array.from([1, 2, 3]),
    });

    expect(text.startsWith(`${FILE_MESSAGE_PREFIX}{`)).toBe(true);
    expect(JSON.parse(text.slice(FILE_MESSAGE_PREFIX.length))).toMatchObject({
      v: 1,
      id: 42,
      name: "notes.txt",
      size: 3,
    });
  });

  it("omits data when not provided", () => {
    const text = buildFileMessageEnvelope({ id: 1, name: "a.bin", size: 10 });
    const body = JSON.parse(text.slice(FILE_MESSAGE_PREFIX.length)) as Record<
      string,
      unknown
    >;

    expect(body.data).toBeUndefined();
  });

  it("parses the envelope back", () => {
    const data = Uint8Array.from([9, 8, 7]);
    const text = buildFileMessageEnvelope({
      id: 77,
      name: "photo.jpg",
      size: data.byteLength,
      data,
    });

    expect(parseFileMessage(text)).toMatchObject({
      fileName: "photo.jpg",
      sizeBytes: 3,
      transferId: 77,
      legacy: false,
      data,
    });
  });

  it("still parses legacy file:: messages", () => {
    expect(parseFileMessage("file::notes\nbody")).toMatchObject({
      fileName: "notes.txt",
      content: "notes\nbody",
      legacy: true,
    });
  });

  it("returns null for ordinary text", () => {
    expect(parseFileMessage("hello")).toBeNull();
  });

  it("treats malformed envelopes as legacy text", () => {
    expect(parseFileMessage("file::{oops")?.legacy).toBe(true);
  });

  it("ignores envelopes with a future version", () => {
    expect(
      parseFileMessage('file::{"v":2,"id":1,"name":"a","size":1}')?.legacy,
    ).toBe(true);
  });
});
