export type TransferStatus = "pending" | "in_progress" | "complete" | "failed";

export type TransferDirection = "upload" | "download" | "send" | "receive";

export interface FileTransfer {
  /** Packet/transfer id. XModem transfers use a generated local id. */
  readonly id: number;
  readonly filename: string;
  readonly direction: TransferDirection;
  readonly status: TransferStatus;
  readonly size?: number;
  /** Number of bytes transferred so far. */
  readonly transferred?: number;
  /** Remote node for mesh transfers. */
  readonly peer?: number;
  readonly crc32?: number;
  readonly error?: string;
  /** File bytes for completed mesh transfers. */
  readonly data?: Uint8Array;
}

/**
 * High-level lifecycle event emitted by `FilesClient`. The raw frame stream
 * stays on the EventBus; chat/UI consumers use these events instead.
 */
export interface FileTransferEvent {
  readonly id: number;
  readonly filename: string;
  readonly direction: "send" | "receive";
  readonly peer: number;
  readonly size: number;
  readonly transferred: number;
  readonly status: TransferStatus;
  readonly crc32?: number;
  readonly error?: string;
  readonly data?: Uint8Array;
}
