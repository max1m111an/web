import { buildFileMessageEnvelope, decodeBase64 } from "@meshtastic/sdk";
import { describe, expect, it } from "vitest";
import { formatFileSize, parseFileMessage } from "./fileMessage.ts";

describe("parseFileMessage", () => {
  it("parses legacy text after the file prefix", () => {
    expect(parseFileMessage("file::hello world!")).toEqual({
      fileName: "hello world!.txt",
      content: "hello world!",
      sizeBytes: 12,
      legacy: true,
    });
  });

  it("returns null for messages without the file prefix", () => {
    expect(parseFileMessage("hello world!")).toBeNull();
    expect(parseFileMessage("some file::hello")).toBeNull();
    expect(parseFileMessage("hello\nsome file::notes")).toBeNull();
  });

  it("is case-sensitive", () => {
    expect(parseFileMessage("FILE::hello")).toBeNull();
  });

  it("uses a fallback name for an empty message", () => {
    expect(parseFileMessage("file::")).toEqual({
      fileName: "file.txt",
      content: "",
      sizeBytes: 0,
      legacy: true,
    });
  });

  it("does not duplicate an existing text extension", () => {
    expect(parseFileMessage("file::notes.TXT")?.fileName).toBe("notes.TXT");
  });

  it("strips path components from legacy file names", () => {
    expect(parseFileMessage("file::a/b")?.fileName).toBe("b.txt");
  });

  it("uses the first line as the file name and keeps the full content", () => {
    const parsed = parseFileMessage("file::notes\nbody");

    expect(parsed?.fileName).toBe("notes.txt");
    expect(parsed?.content).toBe("notes\nbody");
  });

  it("parses a JSON envelope with base64 file data", () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 255]);
    const text = buildFileMessageEnvelope({
      id: 42,
      name: "photo.jpg",
      size: bytes.byteLength,
      data: bytes,
    });

    const parsed = parseFileMessage(text);

    expect(parsed?.legacy).toBe(false);
    expect(parsed?.transferId).toBe(42);
    expect(parsed?.fileName).toBe("photo.jpg");
    expect(parsed?.sizeBytes).toBe(bytes.byteLength);
    expect(parsed?.content).toBe("");
    expect(parsed?.data).toEqual(bytes);
  });

  it("parses an envelope without data (transfer in progress)", () => {
    const text = buildFileMessageEnvelope({
      id: 7,
      name: "report.pdf",
      size: 1536,
    });

    const parsed = parseFileMessage(text);

    expect(parsed?.legacy).toBe(false);
    expect(parsed?.transferId).toBe(7);
    expect(parsed?.data).toBeUndefined();
    expect(parsed?.sizeBytes).toBe(1536);
  });

  it("falls back to the legacy shape for malformed envelopes", () => {
    const parsed = parseFileMessage('file::{"v":2,"id":1}');

    expect(parsed?.legacy).toBe(true);
  });
});

describe("base64 helpers", () => {
  it("round-trips non-ASCII bytes", () => {
    const bytes = new TextEncoder().encode("привет");
    const text = buildFileMessageEnvelope({
      id: 1,
      name: "notes.txt",
      size: bytes.byteLength,
      data: bytes,
    });
    const encoded = JSON.parse(text.slice("file::".length)) as {
      data: string;
    };

    expect(decodeBase64(encoded.data)).toEqual(bytes);
  });
});

describe("formatFileSize", () => {
  it.each([
    [0, "0 B"],
    [1, "1 B"],
    [512, "512 B"],
    [1023, "1023 B"],
    [1024, "1 KB"],
    [1536, "1.5 KB"],
    [2048, "2 KB"],
  ])("formats %i bytes as %s", (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });

  it("handles invalid sizes", () => {
    expect(formatFileSize(-1)).toBe("0 B");
    expect(formatFileSize(Number.NaN)).toBe("0 B");
  });
});
