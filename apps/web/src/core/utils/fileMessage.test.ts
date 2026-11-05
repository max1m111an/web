import { describe, expect, it } from "vitest";
import {
  buildFileMessage,
  buildMessageWithFile,
  formatFileSize,
  parseFileMessage,
  truncateToUtf8Bytes,
} from "./fileMessage.ts";

describe("truncateToUtf8Bytes", () => {
  it("returns the value unchanged when it fits", () => {
    expect(truncateToUtf8Bytes("notes.txt", 20)).toBe("notes.txt");
  });

  it("truncates ascii text by bytes", () => {
    expect(truncateToUtf8Bytes("notes.txt", 5)).toBe("notes");
  });

  it("does not split multi-byte characters", () => {
    expect(truncateToUtf8Bytes("привет", 5)).toBe("пр");
  });

  it("returns an empty string for non-positive limits", () => {
    expect(truncateToUtf8Bytes("notes", 0)).toBe("");
    expect(truncateToUtf8Bytes("notes", -1)).toBe("");
  });
});

describe("buildFileMessage", () => {
  it("builds a file message with the prefix", () => {
    expect(buildFileMessage("notes.txt", 200)).toBe("file::notes.txt");
  });

  it("uses only the base name and removes line breaks", () => {
    expect(buildFileMessage("C:\\docs\\report.pdf", 200)).toBe(
      "file::report.pdf",
    );
    expect(buildFileMessage("re\nport.txt", 200)).toBe("file::re port.txt");
  });

  it("falls back to a default name for an empty value", () => {
    expect(buildFileMessage("   ", 200)).toBe("file::file");
  });

  it("truncates the file name to fit the byte limit", () => {
    const message = buildFileMessage("a-very-long-file-name.txt", 10);

    expect(message).toBe("file::a-ve");
    expect(new TextEncoder().encode(message).byteLength).toBe(10);
  });

  it("does not split multi-byte characters when truncating", () => {
    const message = buildFileMessage("привет.txt", 10);

    expect(message).toBe("file::пр");
    expect(new TextEncoder().encode(message).byteLength).toBeLessThanOrEqual(
      10,
    );
  });

  it("returns a truncated prefix when the limit is smaller than the prefix", () => {
    expect(buildFileMessage("notes.txt", 4)).toBe("file");
    expect(buildFileMessage("notes.txt", 0)).toBe("");
  });
});

describe("buildMessageWithFile", () => {
  it("returns only the file message when there is no text", () => {
    expect(buildMessageWithFile("", "notes.txt", 200)).toBe("file::notes.txt");
    expect(buildMessageWithFile("   ", "notes.txt", 200)).toBe(
      "file::notes.txt",
    );
  });

  it("puts the text before the file marker", () => {
    expect(buildMessageWithFile("hello", "notes.txt", 200)).toBe(
      "hello\nfile::notes.txt",
    );
  });

  it("trims the text", () => {
    expect(buildMessageWithFile("  hello  ", "notes.txt", 200)).toBe(
      "hello\nfile::notes.txt",
    );
  });

  it("truncates the text so the whole message fits the byte limit", () => {
    const message = buildMessageWithFile("hello world", "notes.txt", 20);

    expect(message).toBe("hell\nfile::notes.txt");
    expect(new TextEncoder().encode(message).byteLength).toBeLessThanOrEqual(
      20,
    );
  });

  it("drops the text when there is no room left for it", () => {
    expect(buildMessageWithFile("hello", "notes.txt", 15)).toBe(
      "file::notes.txt",
    );
  });
});

describe("parseFileMessage", () => {
  it("parses text after the file prefix", () => {
    expect(parseFileMessage("file::hello world!")).toEqual({
      fileName: "hello world!.txt",
      content: "hello world!",
      sizeBytes: 12,
    });
  });

  it("parses a caption before the file marker", () => {
    expect(parseFileMessage("hello\nfile::notes")).toEqual({
      fileName: "notes.txt",
      content: "notes",
      sizeBytes: 5,
      caption: "hello",
    });
  });

  it("keeps multi-line captions", () => {
    expect(parseFileMessage("hello\nthere\nfile::notes")?.caption).toBe(
      "hello\nthere",
    );
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
