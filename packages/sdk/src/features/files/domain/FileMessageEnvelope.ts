/**
 * Chat representation of a file transfer.
 *
 * The mesh bytes travel over `FILE_TRANSFER_APP`, while the chat history keeps
 * a `file::` JSON envelope in `Message.text`. The envelope is local-only: it is
 * never sent as a TEXT_MESSAGE_APP packet.
 *
 * Legacy messages written before the file-transfer protocol used
 * `file::<plain text>`; `parseFileMessage` still understands that shape.
 */
export const FILE_MESSAGE_PREFIX = "file::";

const DEFAULT_FILE_NAME = "file";
const TEXT_FILE_EXTENSION = ".txt";
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|\p{Cc}]/gu;

export interface FileMessageEnvelope {
  v: 1;
  id: number;
  name: string;
  size: number;
  data?: string;
}

export interface ParsedFileMessage {
  fileName: string;
  sizeBytes: number;
  /** Text content for legacy `file::<text>` messages. */
  content: string;
  /** Decoded file bytes when the envelope contains `data`. */
  data?: Uint8Array;
  /** Mesh transfer id, used to correlate live progress. */
  transferId?: number;
  /** Whether this was the legacy plain-text representation. */
  legacy: boolean;
}

export interface BuildFileMessageEnvelopeInput {
  id: number;
  name: string;
  size: number;
  data?: Uint8Array;
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

/** Strips path components and characters that are invalid in file names. */
export function sanitizeFileName(fileName: string): string {
  const baseName = fileName.split(/[\\/]/).pop() ?? "";
  const singleLine = baseName.replace(/[\r\n]+/g, " ");
  const sanitized = singleLine.replace(INVALID_FILENAME_CHARS, "_").trim();
  return sanitized || DEFAULT_FILE_NAME;
}

/** Builds the local `file::` envelope stored in chat history. */
export function buildFileMessageEnvelope(
  input: BuildFileMessageEnvelopeInput,
): string {
  const envelope: FileMessageEnvelope = {
    v: 1,
    id: input.id >>> 0,
    name: sanitizeFileName(input.name),
    size: Math.max(0, Math.trunc(input.size)),
  };
  if (input.data) {
    envelope.data = encodeBase64(input.data);
  }
  return `${FILE_MESSAGE_PREFIX}${JSON.stringify(envelope)}`;
}

/**
 * Parses either the JSON envelope or a legacy `file::<text>` message.
 * Returns null for ordinary chat text.
 */
export function parseFileMessage(text: string): ParsedFileMessage | null {
  if (!text.startsWith(FILE_MESSAGE_PREFIX)) {
    return null;
  }

  const body = text.slice(FILE_MESSAGE_PREFIX.length);

  if (body.startsWith("{")) {
    const envelope = parseEnvelope(body);
    if (envelope) {
      let data: Uint8Array | undefined;
      if (envelope.data) {
        try {
          data = decodeBase64(envelope.data);
        } catch {
          data = undefined;
        }
      }
      return {
        fileName: sanitizeFileName(envelope.name),
        sizeBytes: data?.byteLength ?? envelope.size,
        content: "",
        data,
        transferId: envelope.id,
        legacy: false,
      };
    }
  }

  return parseLegacy(body);
}

function parseEnvelope(body: string): FileMessageEnvelope | null {
  try {
    const value: unknown = JSON.parse(body);
    if (!value || typeof value !== "object") return null;

    const record = value as Record<string, unknown>;
    if (record.v !== 1) return null;
    if (typeof record.id !== "number" || !Number.isFinite(record.id)) {
      return null;
    }
    if (typeof record.name !== "string" || record.name.length === 0) {
      return null;
    }
    if (typeof record.size !== "number" || !Number.isFinite(record.size)) {
      return null;
    }
    if (record.data !== undefined && typeof record.data !== "string") {
      return null;
    }

    return {
      v: 1,
      id: record.id >>> 0,
      name: record.name,
      size: Math.max(0, Math.trunc(record.size)),
      data: record.data,
    };
  } catch {
    return null;
  }
}

function parseLegacy(content: string): ParsedFileMessage {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  const fileName = ensureTextExtension(sanitizeFileName(firstLine));

  return {
    fileName,
    content,
    sizeBytes: new TextEncoder().encode(content).byteLength,
    legacy: true,
  };
}

function ensureTextExtension(fileName: string): string {
  return fileName.toLowerCase().endsWith(TEXT_FILE_EXTENSION)
    ? fileName
    : `${fileName}${TEXT_FILE_EXTENSION}`;
}

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Portable base64 encoder (browser + Node). */
export function encodeBase64(bytes: Uint8Array): string {
  let result = "";

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1];
    const c = bytes[i + 2];

    result += BASE64_ALPHABET[a >> 2];
    result += BASE64_ALPHABET[((a & 0x03) << 4) | ((b ?? 0) >> 4)];

    if (b === undefined) {
      result += "==";
      break;
    }

    result += BASE64_ALPHABET[((b & 0x0f) << 2) | ((c ?? 0) >> 6)];

    if (c === undefined) {
      result += "=";
      break;
    }

    result += BASE64_ALPHABET[c & 0x3f];
  }

  return result;
}

/** Portable base64 decoder (browser + Node). */
export function decodeBase64(value: string): Uint8Array {
  const normalized = value.replace(/\s+/g, "");
  if (normalized.length === 0) return new Uint8Array(0);
  if (normalized.length % 4 !== 0) {
    throw new Error("Invalid base64 value");
  }

  const padding = normalized.endsWith("==")
    ? 2
    : normalized.endsWith("=")
      ? 1
      : 0;
  const out = new Uint8Array((normalized.length / 4) * 3 - padding);
  let cursor = 0;

  for (let i = 0; i < normalized.length; i += 4) {
    const c0 = base64Index(normalized[i]);
    const c1 = base64Index(normalized[i + 1]);
    const c2 = normalized[i + 2] === "=" ? 0 : base64Index(normalized[i + 2]);
    const c3 = normalized[i + 3] === "=" ? 0 : base64Index(normalized[i + 3]);

    const triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;

    if (cursor < out.length) out[cursor++] = (triple >> 16) & 0xff;
    if (cursor < out.length) out[cursor++] = (triple >> 8) & 0xff;
    if (cursor < out.length) out[cursor++] = triple & 0xff;
  }

  return out;
}

function base64Index(char: string | undefined): number {
  if (char === undefined) throw new Error("Invalid base64 value");
  const index = BASE64_ALPHABET.indexOf(char);
  if (index === -1) throw new Error("Invalid base64 value");
  return index;
}
