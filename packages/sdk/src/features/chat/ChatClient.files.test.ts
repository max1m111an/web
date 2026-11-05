import { describe, expect, it, vi } from "vitest";
import { MeshClient } from "../../core/client/MeshClient.ts";
import { createFakeTransport } from "../../core/testing/createFakeTransport.ts";
import { parseFileMessage } from "../files/domain/FileMessageEnvelope.ts";
import type { FileTransferEvent } from "../files/domain/FileTransfer.ts";
import { InMemoryMessageRepository } from "./infrastructure/repositories/InMemoryMessageRepository.ts";
import { MessageState } from "./domain/MessageState.ts";

const PEER = 9876;

function makeClient() {
  const repository = new InMemoryMessageRepository();
  const { transport } = createFakeTransport();
  const client = new MeshClient({ transport, chat: { repository } });
  return { client, repository };
}

function event(overrides: Partial<FileTransferEvent>): FileTransferEvent {
  return {
    id: 1,
    filename: "a.bin",
    direction: "send",
    peer: PEER,
    size: 4,
    transferred: 0,
    status: "in_progress",
    ...overrides,
  };
}

describe("ChatClient file transfer messages", () => {
  it("appends an outbound file message to the peer conversation", async () => {
    const { client, repository } = makeClient();
    const messages = client.chat.direct(PEER);

    client.events.onFileTransferStarted.dispatch(event({ id: 11 }));

    expect(messages.value).toHaveLength(1);
    const message = messages.value[0]!;
    expect(message.type).toBe("direct");
    expect(message.from).toBe(client.myNodeNum);
    expect(message.to).toBe(PEER);
    expect(message.state).toBe(MessageState.Pending);

    const parsed = parseFileMessage(message.text);
    expect(parsed?.transferId).toBe(11);
    expect(parsed?.fileName).toBe("a.bin");
    expect(parsed?.data).toBeUndefined();

    await vi.waitFor(async () => {
      const stored = await repository.loadRecent(
        { kind: "direct", peer: PEER },
        10,
      );
      expect(stored).toHaveLength(1);
    });
  });

  it("patches the outbound message with data when the transfer completes", async () => {
    const { client, repository } = makeClient();
    const messages = client.chat.direct(PEER);
    const data = Uint8Array.from([1, 2, 3, 4]);

    client.events.onFileTransferStarted.dispatch(event({ id: 12 }));
    client.events.onFileTransferCompleted.dispatch(
      event({
        id: 12,
        status: "complete",
        transferred: 4,
        crc32: 0xcbf43926,
        data,
      }),
    );

    expect(messages.value).toHaveLength(1);
    const message = messages.value[0]!;
    expect(message.state).toBe(MessageState.Ack);
    expect(parseFileMessage(message.text)?.data).toEqual(data);

    await vi.waitFor(async () => {
      const [stored] = await repository.loadRecent(
        { kind: "direct", peer: PEER },
        10,
      );
      expect(stored?.state).toBe(MessageState.Ack);
      expect(parseFileMessage(stored?.text ?? "")?.data).toEqual(data);
    });
  });

  it("appends an inbound file message and marks it unread", () => {
    const { client } = makeClient();
    const messages = client.chat.direct(PEER);

    client.events.onFileTransferStarted.dispatch(
      event({ id: 13, direction: "receive" }),
    );

    const message = messages.value[0]!;
    expect(message.from).toBe(PEER);
    expect(message.to).toBe(client.myNodeNum);
    expect(client.chat.unread.count({ kind: "direct", peer: PEER }).value).toBe(
      1,
    );
  });

  it("marks the message failed when the transfer fails", () => {
    const { client } = makeClient();
    const messages = client.chat.direct(PEER);

    client.events.onFileTransferStarted.dispatch(event({ id: 14 }));
    client.events.onFileTransferFailed.dispatch(
      event({ id: 14, status: "failed", error: "timeout" }),
    );

    expect(messages.value[0]?.state).toBe(MessageState.Failed);
  });

  it("materializes a message for a completion that had no started event", () => {
    const { client } = makeClient();
    const messages = client.chat.direct(PEER);
    const data = Uint8Array.from([9, 9]);

    client.events.onFileTransferCompleted.dispatch(
      event({
        id: 15,
        direction: "receive",
        status: "complete",
        size: 2,
        transferred: 2,
        data,
      }),
    );

    expect(messages.value).toHaveLength(1);
    expect(messages.value[0]?.state).toBe(MessageState.Ack);
    expect(parseFileMessage(messages.value[0]!.text)?.data).toEqual(data);
  });
});
