import type { ChannelNumber } from "../../../core/types.ts";
import type { Message } from "./Message.ts";
import type { MessageState } from "./MessageState.ts";

/**
 * Conversation key. Broadcast messages are keyed by channel; direct messages
 * are keyed by the peer node number.
 */
export type ConversationKey =
  | { kind: "channel"; channel: ChannelNumber }
  | { kind: "direct"; peer: number };

export interface RetentionPolicy {
  /** Drop anything older than this many ms. */
  olderThanMs?: number;
  /** Keep at most this many messages per conversation. */
  maxPerBucket?: number;
}

/** Mutable fields of a persisted message. */
export interface MessageUpdate {
  text?: string;
  state?: MessageState;
}

/**
 * Port for persisting chat messages. Implementations live in adapter packages
 * (e.g. `@meshtastic/sdk-storage-sqlocal`) or in-memory within the SDK itself.
 *
 * Reads are paginated so consumers can lazy-load history on scroll rather than
 * rehydrating every message at boot.
 */
export interface MessageRepository {
  loadRecent(key: ConversationKey, limit: number): Promise<Message[]>;
  loadBefore(
    key: ConversationKey,
    cursor: Date,
    limit: number,
  ): Promise<Message[]>;
  /**
   * Appends a message. Pass `key` when the conversation cannot be inferred
   * from the message alone — optimistically-appended outbound messages have
   * `from === myNodeNum`, so a direct message's peer is only known to the
   * caller.
   */
  append(message: Message, key?: ConversationKey): Promise<void>;
  /** Batch variant of `append`; `key` applies to every message in the batch. */
  appendBatch(
    messages: ReadonlyArray<Message>,
    key?: ConversationKey,
  ): Promise<void>;
  updateState(id: number, state: MessageState): Promise<void>;
  /** Patches the mutable fields of an already-persisted message. */
  updateMessage(id: number, patch: MessageUpdate): Promise<void>;
  prune(policy: RetentionPolicy): Promise<void>;
  /** Deletes every message in a single conversation. */
  clearConversation(key: ConversationKey): Promise<void>;
  /** Deletes every message for the scoped device / consumer. */
  clear(): Promise<void>;
}

export function conversationKeyString(key: ConversationKey): string {
  return key.kind === "channel"
    ? `channel:${key.channel}`
    : `direct:${key.peer}`;
}
