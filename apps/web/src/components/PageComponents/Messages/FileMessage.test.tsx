import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileMessage } from "./FileMessage.tsx";

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
});
