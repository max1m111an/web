import { describe, expect, it } from "vitest";
import { formatFileSize, parseFileMessage } from "./fileMessage.ts";

describe("parseFileMessage", () => {
  it("parses text after the file prefix", () => {
    expect(parseFileMessage("file::hello world!")).toEqual({
      fileName: "hello world!.txt",
      content: "hello world!",
      sizeBytes: 12,
    });
  });

  it("returns null for messages without the file prefix", () => {
    expect(parseFileMessage("hello world!")).toBeNull();
    expect(parseFileMessage("some file::hello")).toBeNull();
  });

  it("is case-sensitive", () => {
    expect(parseFileMessage("FILE::hello")).toBeNull();
  });

  it("uses a fallback name for an empty message", () => {
    expect(parseFileMessage("file::")).toEqual({
      fileName: "file.txt",
      content: "",
      sizeBytes: 0,
    });
  });

  it("does not duplicate an existing text extension", () => {
    expect(parseFileMessage("file::notes.TXT")).toEqual({
      fileName: "notes.TXT",
      content: "notes.TXT",
      sizeBytes: 9,
    });
  });

  it("sanitizes characters that are invalid in file names", () => {
    expect(parseFileMessage("file::a/b")).toEqual({
      fileName: "a_b.txt",
      content: "a/b",
      sizeBytes: 3,
    });
  });

  it("uses the first line as the file name and keeps the full content", () => {
    expect(parseFileMessage("file::notes\nbody")).toEqual({
      fileName: "notes.txt",
      content: "notes\nbody",
      sizeBytes: 10,
    });
  });

  it("calculates the size in UTF-8 bytes", () => {
    expect(parseFileMessage("file::привет")?.sizeBytes).toBe(12);
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
