export const FILE_MESSAGE_PREFIX = "file::";

const DEFAULT_FILE_NAME = "file";
const TEXT_FILE_EXTENSION = ".txt";
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|\p{Cc}]/gu;

export interface FileMessageData {
  fileName: string;
  content: string;
  sizeBytes: number;
}

function sanitizeFileName(fileName: string): string {
  const sanitized = fileName.replace(INVALID_FILENAME_CHARS, "_").trim();
  return sanitized || DEFAULT_FILE_NAME;
}

function ensureTextExtension(fileName: string): string {
  return fileName.toLowerCase().endsWith(TEXT_FILE_EXTENSION)
    ? fileName
    : `${fileName}${TEXT_FILE_EXTENSION}`;
}

/**
 * Parses messages prefixed with `file::` as text files.
 *
 * The first line after the prefix becomes the file name, while the whole
 * text after the prefix is used as the file content.
 */
export function parseFileMessage(text: string): FileMessageData | null {
  if (!text.startsWith(FILE_MESSAGE_PREFIX)) {
    return null;
  }

  const content = text.slice(FILE_MESSAGE_PREFIX.length);
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  const fileName = ensureTextExtension(sanitizeFileName(firstLine));

  return {
    fileName,
    content,
    sizeBytes: new TextEncoder().encode(content).byteLength,
  };
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }

  const kilobytes = (bytes / 1024).toFixed(1).replace(/\.0$/, "");
  return `${kilobytes} KB`;
}
