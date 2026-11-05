export const FILE_MESSAGE_PREFIX = "file::";

const DEFAULT_FILE_NAME = "file";
const TEXT_FILE_EXTENSION = ".txt";
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|\p{Cc}]/gu;

export interface FileMessageData {
  fileName: string;
  content: string;
  sizeBytes: number;
  caption?: string;
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
 * Truncates a string to the given number of UTF-8 bytes without splitting
 * multi-byte characters (including surrogate pairs).
 */
export function truncateToUtf8Bytes(value: string, maxBytes: number): string {
  if (maxBytes <= 0) {
    return "";
  }

  const encoder = new TextEncoder();
  let result = "";
  let usedBytes = 0;

  for (const char of value) {
    const charBytes = encoder.encode(char).byteLength;
    if (usedBytes + charBytes > maxBytes) {
      break;
    }

    result += char;
    usedBytes += charBytes;
  }

  return result;
}

function getFileName(fileName: string): string {
  const baseName = fileName.split(/[\\/]/).pop() ?? "";
  const singleLine = baseName.replace(/[\r\n]+/g, " ").trim();
  return singleLine || DEFAULT_FILE_NAME;
}

/**
 * Builds a `file::` message for the given file name, truncated so that the
 * whole message fits into `maxBytes` bytes.
 */
export function buildFileMessage(fileName: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  const prefixBytes = encoder.encode(FILE_MESSAGE_PREFIX).byteLength;

  if (maxBytes <= prefixBytes) {
    return truncateToUtf8Bytes(FILE_MESSAGE_PREFIX, maxBytes);
  }

  const name = getFileName(fileName);
  const availableBytes = maxBytes - prefixBytes;
  const truncatedName = truncateToUtf8Bytes(name, availableBytes).trimEnd();

  return `${FILE_MESSAGE_PREFIX}${truncatedName}`;
}

/**
 * Parses messages that contain a `file::` marker as text files.
 *
 * The marker may start the message or follow a text caption on a new line.
 * The first line after the prefix becomes the file name, while the whole
 * text after the prefix is used as the file content.
 */
export function parseFileMessage(text: string): FileMessageData | null {
  const markerIndex = findFileMarkerIndex(text);

  if (markerIndex === -1) {
    return null;
  }

  const caption = text
    .slice(0, markerIndex)
    .replace(/\r?\n$/, "")
    .trimEnd();
  const content = text.slice(markerIndex + FILE_MESSAGE_PREFIX.length);
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  const fileName = ensureTextExtension(sanitizeFileName(firstLine));

  return {
    fileName,
    content,
    sizeBytes: new TextEncoder().encode(content).byteLength,
    ...(caption ? { caption } : {}),
  };
}

function findFileMarkerIndex(text: string): number {
  if (text.startsWith(FILE_MESSAGE_PREFIX)) {
    return 0;
  }

  const marker = `\n${FILE_MESSAGE_PREFIX}`;
  const index = text.lastIndexOf(marker);

  return index === -1 ? -1 : index + 1;
}

/**
 * Builds a message that starts with the user's text and ends with the
 * `file::` marker. The text is truncated when necessary so the whole message
 * fits into `maxBytes`.
 */
export function buildMessageWithFile(
  text: string,
  fileName: string,
  maxBytes: number,
): string {
  const trimmedText = text.trim();

  if (!trimmedText) {
    return buildFileMessage(fileName, maxBytes);
  }

  const fileMessage = buildFileMessage(fileName, maxBytes);
  const encoder = new TextEncoder();
  const separatorBytes = 1; // "\n"
  const availableTextBytes =
    maxBytes - encoder.encode(fileMessage).byteLength - separatorBytes;
  const truncatedText =
    availableTextBytes > 0
      ? truncateToUtf8Bytes(trimmedText, availableTextBytes).trimEnd()
      : "";

  return truncatedText ? `${truncatedText}\n${fileMessage}` : fileMessage;
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
