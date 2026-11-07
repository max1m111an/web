import {
  FILE_MESSAGE_PREFIX,
  parseFileMessage,
  type ParsedFileMessage,
} from "@meshtastic/sdk";

export { FILE_MESSAGE_PREFIX, parseFileMessage };

/** Shape of a `file::` message as rendered by the chat UI. */
export type FileMessageData = ParsedFileMessage;

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
