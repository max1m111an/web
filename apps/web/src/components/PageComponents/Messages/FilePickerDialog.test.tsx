import { fireEvent, render, screen } from "@testing-library/react";
import type { DragEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FilePickerDialog } from "./FilePickerDialog.tsx";

vi.mock("@components/UI/Dialog.tsx", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({
    children,
    onDragOver,
    onDrop,
  }: {
    children: ReactNode;
    onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
    onDrop?: (event: DragEvent<HTMLDivElement>) => void;
  }) => (
    <div onDragOver={onDragOver} onDrop={onDrop}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h1>{children}</h1>,
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogClose: () => null,
}));

describe("FilePickerDialog", () => {
  const onOpenChange = vi.fn();
  const onFilesSelected = vi.fn();

  const renderComponent = () =>
    render(
      <FilePickerDialog
        open
        onOpenChange={onOpenChange}
        onFilesSelected={onFilesSelected}
      />,
    );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the dialog content and drop zone", () => {
    renderComponent();

    expect(
      screen.getByRole("heading", { name: /attach files/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("file-drop-zone")).toBeInTheDocument();
    expect(screen.getByTestId("file-input")).toBeInTheDocument();
  });

  it("selects a dropped file and closes the dialog", () => {
    renderComponent();
    const file = new File(["content"], "report.pdf");

    fireEvent.drop(screen.getByTestId("file-drop-zone"), {
      dataTransfer: { files: [file] },
    });

    expect(onFilesSelected).toHaveBeenCalledWith([file]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("selects multiple files picked from the file input in order", () => {
    renderComponent();
    const firstFile = new File(["content"], "notes.txt");
    const secondFile = new File(["more content"], "report.pdf");
    const input = screen.getByTestId("file-input") as HTMLInputElement;

    Object.defineProperty(input, "files", {
      value: [firstFile, secondFile],
      configurable: true,
    });
    fireEvent.change(input);

    expect(onFilesSelected).toHaveBeenCalledWith([firstFile, secondFile]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("allows selecting multiple files", () => {
    renderComponent();

    expect(screen.getByTestId("file-input")).toHaveAttribute("multiple");
  });

  it("opens the file input when the choose button is clicked", () => {
    renderComponent();
    const input = screen.getByTestId("file-input") as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");

    fireEvent.click(screen.getByRole("button", { name: /^choose files$/i }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
