export { FilesClient, FileTransferError } from "./FilesClient.ts";
export type { FileTransferErrorCode } from "./FilesClient.ts";
export type {
  FileTransfer,
  FileTransferEvent,
  TransferDirection,
  TransferStatus,
} from "./domain/FileTransfer.ts";
export {
  buildFileMessageEnvelope,
  decodeBase64,
  encodeBase64,
  FILE_MESSAGE_PREFIX,
  parseFileMessage,
  sanitizeFileName,
  truncateToUtf8Bytes,
} from "./domain/FileMessageEnvelope.ts";
export type {
  FileMessageEnvelope,
  ParsedFileMessage,
} from "./domain/FileMessageEnvelope.ts";
export {
  createFileTransferFrame,
  decodeFileTransferFrame,
  encodeFileTransferFrame,
  FILE_TRANSFER_ACK_TIMEOUT_MS,
  FILE_TRANSFER_CHUNK_SIZE,
  FILE_TRANSFER_MAX_FILENAME_BYTES,
  FILE_TRANSFER_MAX_FILE_SIZE,
  FILE_TRANSFER_MAX_RETRIES,
  FILE_TRANSFER_PORTNUM,
  FileTransferStatus,
  FileTransferType,
  fileTransferCrc32,
} from "./protocol/FileTransferCodec.ts";
export type { FileTransferFrame } from "./protocol/FileTransferCodec.ts";
