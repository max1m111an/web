import type { FileTransfer } from "@meshtastic/sdk";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileMessage } from "./FileMessage.tsx";

const { mockUseFileTransfer } = vi.hoisted(() => ({
  mockUseFileTransfer: vi.fn((): ReadonlyArray<FileTransfer> => []),
}));

vi.mock("@meshtastic/sdk-react", () => ({
  useFileTransfer: mockUseFileTransfer,
}));

const createObjectURL = vi.fn((_blob: Blob | MediaSource) => "blob:mock");
const revokeObjectURL = vi.fn((_url: string) => {});

describe("FileMessage", () => {
  let appendedLink: HTMLAnchorElement | null = null;

  beforeEach(() => {
    vi.spyOn(URL, "createObjectURL").mockImplementation(createObjectURL);
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(revokeObjectURL);
    appendedLink = null;

    const originalAppendChild = document.body.appendChild.bind(document.body);

    vi.spyOn(document.body, "appendChild").mockImplementation((node: Node) => {
      if (node instanceof HTMLAnchorElement) {
        appendedLink = node;
      }
      return originalAppendChild(node);
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    mockUseFileTransfer.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the file name and size", () => {
    render(
      <FileMessage
        fileName="hello world!.txt"
        content="hello world!"
        sizeBytes={12}
      />,
    );

    expect(screen.getByText("hello world!.txt")).toBeInTheDocument();
    expect(screen.getByText("12 B")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Download hello world!.txt" }),
    ).toBeInTheDocument();
  });

  it("downloads the message text when clicked", async () => {
    render(
      <FileMessage
        fileName="hello world!.txt"
        content="hello world!"
        sizeBytes={12}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Download hello world!.txt" }),
    );

    expect(createObjectURL).toHaveBeenCalledTimes(1);

    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;

    expect(blob.type).toBe("text/plain;charset=utf-8");
    await expect(blob.text()).resolves.toBe("hello world!");

    expect(appendedLink?.download).toBe("hello world!.txt");
    expect(appendedLink?.href).toBe("blob:mock");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });

  it("downloads real file bytes", async () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 255]);

    render(
      <FileMessage
        fileName="photo.jpg"
        sizeBytes={bytes.byteLength}
        data={bytes}
        legacy={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Download photo.jpg" }));

    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;

    expect(blob.type).toBe("application/octet-stream");
    await expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  });

  it("shows progress for a live transfer", () => {
    mockUseFileTransfer.mockReturnValue([
      {
        id: 5,
        filename: "big.bin",
        direction: "receive",
        status: "in_progress",
        size: 200,
        transferred: 50,
        peer: 1,
      },
    ]);

    render(
      <FileMessage
        fileName="big.bin"
        sizeBytes={200}
        transferId={5}
        legacy={false}
      />,
    );

    expect((screen.getByRole("progressbar") as HTMLProgressElement).value).toBe(
      25,
    );
    expect(screen.getByText(/transferring/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a failure message for a failed transfer", () => {
    mockUseFileTransfer.mockReturnValue([
      {
        id: 6,
        filename: "bad.bin",
        direction: "receive",
        status: "failed",
        size: 10,
        transferred: 3,
        peer: 1,
        error: "checksum mismatch",
      },
    ]);

    render(
      <FileMessage
        fileName="bad.bin"
        sizeBytes={10}
        transferId={6}
        legacy={false}
      />,
    );

    expect(screen.getByText(/transfer failed/i)).toBeInTheDocument();
  });
});
