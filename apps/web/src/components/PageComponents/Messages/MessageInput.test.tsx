import type { ConversationKey } from "@meshtastic/sdk";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageInput, type MessageInputProps } from "./MessageInput.tsx";

vi.mock("@components/UI/Button.tsx", () => ({
  Button: vi.fn(({ type, className, children, onClick, onSubmit, ...rest }) => (
    <button
      type={type}
      className={className}
      onClick={onClick}
      onSubmit={onSubmit}
      {...rest}
    >
      {children}
    </button>
  )),
}));

vi.mock("@components/UI/Input.tsx", () => ({
  Input: vi.fn(({ minLength, name, placeholder, value, onChange }) => (
    <input
      minLength={minLength}
      name={name}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      data-testid="message-input-field"
    />
  )),
}));

vi.mock("@components/PageComponents/Messages/FilePickerDialog.tsx", () => ({
  FilePickerDialog: ({
    open,
    onOpenChange,
    onFilesSelected,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onFilesSelected: (files: { name: string; sizeBytes: number }[]) => void;
  }) =>
    open ? (
      <div>
        <button
          type="button"
          onClick={() => {
            onFilesSelected([{ name: "report.pdf", sizeBytes: 1536 }]);
            onOpenChange(false);
          }}
        >
          select-file
        </button>
        <button
          type="button"
          onClick={() => {
            onFilesSelected([{ name: "notes.txt", sizeBytes: 20 }]);
            onOpenChange(false);
          }}
        >
          select-another-file
        </button>
        <button
          type="button"
          onClick={() => {
            onFilesSelected([
              { name: "report.pdf", sizeBytes: 1536 },
              { name: "notes.txt", sizeBytes: 20 },
            ]);
            onOpenChange(false);
          }}
        >
          select-multiple-files
        </button>
      </div>
    ) : null,
}));

const mockSetText = vi.fn();
const mockClear = vi.fn();
let mockDraftText = "";

vi.mock("@meshtastic/sdk-react", () => ({
  useDraft: vi.fn(() => ({
    text: mockDraftText,
    setText: mockSetText,
    clear: mockClear,
  })),
}));

vi.mock("lucide-react", () => ({
  FileText: vi.fn(() => <svg data-testid="file-text-icon" />),
  PaperclipIcon: vi.fn(() => <svg data-testid="paperclip-icon" />),
  SendIcon: vi.fn(() => <svg data-testid="send-icon" />),
  X: vi.fn(() => <svg data-testid="x-icon" />),
}));

describe("MessageInput", () => {
  const mockOnSend = vi.fn();
  const directConv: ConversationKey = { kind: "direct", peer: 123 };
  const broadcastConv: ConversationKey = { kind: "channel", channel: 0 };
  const defaultProps: MessageInputProps = {
    onSend: mockOnSend,
    conversation: directConv,
    maxBytes: 256,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDraftText = "";
  });

  const renderComponent = (props: Partial<MessageInputProps> = {}) => {
    render(<MessageInput {...defaultProps} {...props} />);
  };

  it("should render the input field, byte counter, attach and send buttons", () => {
    renderComponent();
    expect(screen.getByTestId("message-input-field")).toBeInTheDocument();
    expect(screen.getByTestId("byte-counter")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /attach file/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("paperclip-icon")).toBeInTheDocument();
    expect(screen.getByTestId("send-icon")).toBeInTheDocument();
  });

  it("shows selected files as square previews above the input", () => {
    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /attach file/i }));
    fireEvent.click(screen.getByRole("button", { name: /select-file/i }));
    fireEvent.click(screen.getByRole("button", { name: /attach file/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /select-another-file/i }),
    );

    const input = screen.getByTestId("message-input-field") as HTMLInputElement;

    expect(input.value).toBe("");
    expect(mockSetText).not.toHaveBeenCalled();

    const pendingFiles = screen.getAllByTestId("pending-file");

    expect(pendingFiles).toHaveLength(2);
    expect(pendingFiles[0]).toHaveAttribute("title", "report.pdf");
    expect(pendingFiles[0]).toHaveTextContent("report.pdf");
    expect(pendingFiles[0]).toHaveTextContent("1.5 KB");
    expect(pendingFiles[1]).toHaveAttribute("title", "notes.txt");
    expect(pendingFiles[1]).toHaveTextContent("notes.txt");
    expect(pendingFiles[1]).toHaveTextContent("20 B");
    expect(screen.getAllByTestId("file-text-icon")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: /attach file/i }),
    ).not.toBeDisabled();
    expect(screen.getByTestId("byte-counter")).toHaveTextContent(
      `0/${defaultProps.maxBytes}`,
    );
  });

  it("adds multiple selected files to the pool at once", () => {
    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /attach file/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /select-multiple-files/i }),
    );

    const pendingFiles = screen.getAllByTestId("pending-file");

    expect(pendingFiles).toHaveLength(2);
    expect(pendingFiles[0]).toHaveAttribute("title", "report.pdf");
    expect(pendingFiles[1]).toHaveAttribute("title", "notes.txt");
  });

  it("truncates the file message name to maxBytes", async () => {
    renderComponent({ maxBytes: 10 });
    fireEvent.click(screen.getByRole("button", { name: /attach file/i }));
    fireEvent.click(screen.getByRole("button", { name: /select-file/i }));

    fireEvent.submit(screen.getByRole("form"));

    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith("file::repo");
    });
  });

  it("sends the text and each file as separate messages in order", async () => {
    renderComponent();
    const input = screen.getByTestId("message-input-field") as HTMLInputElement;
    const formElement = screen.getByRole("form");

    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: /attach file/i }));
    fireEvent.click(screen.getByRole("button", { name: /select-file/i }));
    fireEvent.click(screen.getByRole("button", { name: /attach file/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /select-another-file/i }),
    );

    expect(input.value).toBe("hello");
    expect(screen.getByTestId("byte-counter")).toHaveTextContent(
      `${new Blob(["hello"]).size}/${defaultProps.maxBytes}`,
    );

    fireEvent.submit(formElement);

    await waitFor(() => {
      expect(mockOnSend.mock.calls).toEqual([
        ["hello"],
        ["file::report.pdf"],
        ["file::notes.txt"],
      ]);
      expect(mockClear).toHaveBeenCalled();
      expect(input.value).toBe("");
      expect(screen.queryAllByTestId("pending-file")).toHaveLength(0);
    });
  });

  it("sends only the files when the input is empty", async () => {
    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /attach file/i }));
    fireEvent.click(screen.getByRole("button", { name: /select-file/i }));
    fireEvent.click(screen.getByRole("button", { name: /attach file/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /select-another-file/i }),
    );

    fireEvent.submit(screen.getByRole("form"));

    await waitFor(() => {
      expect(mockOnSend.mock.calls).toEqual([
        ["file::report.pdf"],
        ["file::notes.txt"],
      ]);
      expect(mockClear).toHaveBeenCalled();
      expect(screen.queryAllByTestId("pending-file")).toHaveLength(0);
    });
  });

  it("removes a pending file from the pool", () => {
    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /attach file/i }));
    fireEvent.click(screen.getByRole("button", { name: /select-file/i }));
    fireEvent.click(screen.getByRole("button", { name: /attach file/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /select-another-file/i }),
    );

    fireEvent.click(screen.getByRole("button", { name: /remove notes\.txt/i }));

    const pendingFiles = screen.getAllByTestId("pending-file");

    expect(pendingFiles).toHaveLength(1);
    expect(pendingFiles[0]).toHaveAttribute("title", "report.pdf");
  });

  it("should initialize with the persisted draft text from the SDK", () => {
    mockDraftText = "Existing draft message";
    renderComponent();

    const expectedBytes = new Blob([mockDraftText]).size;
    expect(screen.getByTestId("byte-counter")).toHaveTextContent(
      `${expectedBytes}/${defaultProps.maxBytes}`,
    );
  });

  it("should update input value, byte counter, and call setText on change within limits", () => {
    renderComponent();
    const inputElement = screen.getByTestId("message-input-field");
    const testMessage = "Hello there!";
    const expectedBytes = new Blob([testMessage]).size;

    fireEvent.change(inputElement, { target: { value: testMessage } });

    expect((inputElement as HTMLInputElement).value).toBe(testMessage);
    expect(screen.getByTestId("byte-counter")).toHaveTextContent(
      `${expectedBytes}/${defaultProps.maxBytes}`,
    );
    expect(mockSetText).toHaveBeenCalledTimes(1);
    expect(mockSetText).toHaveBeenCalledWith(testMessage);
  });

  it("should NOT update input value or call setText if maxBytes is exceeded", () => {
    const smallMaxBytes = 5;
    renderComponent({ maxBytes: smallMaxBytes });
    const inputElement = screen.getByTestId("message-input-field");
    const initialValue = "12345";
    const excessiveValue = "123456";

    fireEvent.change(inputElement, { target: { value: initialValue } });
    expect((inputElement as HTMLInputElement).value).toBe(initialValue);
    expect(mockSetText).toHaveBeenCalledWith(initialValue);
    mockSetText.mockClear();

    fireEvent.change(inputElement, { target: { value: excessiveValue } });

    expect((inputElement as HTMLInputElement).value).toBe(initialValue);
    expect(screen.getByTestId("byte-counter")).toHaveTextContent(
      `${smallMaxBytes}/${smallMaxBytes}`,
    );
    expect(mockSetText).not.toHaveBeenCalled();
  });

  it("should call onSend, clear input, reset byte counter, and call clear on valid submit", async () => {
    renderComponent();
    const inputElement = screen.getByTestId("message-input-field");
    const formElement = screen.getByRole("form");
    const testMessage = "Send this message";

    fireEvent.change(inputElement, { target: { value: testMessage } });
    fireEvent.submit(formElement);

    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledTimes(1);
      expect(mockOnSend).toHaveBeenCalledWith(testMessage);
      expect((inputElement as HTMLInputElement).value).toBe("");
      expect(screen.getByTestId("byte-counter")).toHaveTextContent(
        `0/${defaultProps.maxBytes}`,
      );
      expect(mockClear).toHaveBeenCalledTimes(1);
    });
  });

  it("should trim whitespace before calling onSend", async () => {
    renderComponent();
    const inputElement = screen.getByTestId("message-input-field");
    const formElement = screen.getByRole("form");
    const testMessageWithWhitespace = "  Trim me!  ";
    const expectedTrimmedMessage = "Trim me!";

    fireEvent.change(inputElement, {
      target: { value: testMessageWithWhitespace },
    });
    fireEvent.submit(formElement);

    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledTimes(1);
      expect(mockOnSend).toHaveBeenCalledWith(expectedTrimmedMessage);
      expect(mockClear).toHaveBeenCalled();
    });
  });

  it("should not call onSend or clear if input is empty on submit", async () => {
    renderComponent();
    const inputElement = screen.getByTestId("message-input-field");
    const formElement = screen.getByRole("form");

    expect((inputElement as HTMLInputElement).value).toBe("");

    fireEvent.submit(formElement);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(mockOnSend).not.toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();
  });

  it("should not call onSend or clear if input contains only whitespace on submit", async () => {
    renderComponent();
    const inputElement = screen.getByTestId("message-input-field");
    const formElement = screen.getByRole("form");
    const whitespaceMessage = "   \t   ";

    fireEvent.change(inputElement, { target: { value: whitespaceMessage } });
    expect((inputElement as HTMLInputElement).value).toBe(whitespaceMessage);

    fireEvent.submit(formElement);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(mockOnSend).not.toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();

    expect((inputElement as HTMLInputElement).value).toBe(whitespaceMessage);
  });

  it("should work with a broadcast conversation key", () => {
    mockDraftText = "Broadcast draft";
    renderComponent({ conversation: broadcastConv });

    expect(
      (screen.getByTestId("message-input-field") as HTMLInputElement).value,
    ).toBe("Broadcast draft");

    const inputElement = screen.getByTestId(
      "message-input-field",
    ) as HTMLInputElement;
    const formElement = screen.getByRole("form");
    const newMessage = "New broadcast msg";

    fireEvent.change(inputElement, { target: { value: newMessage } });
    expect(mockSetText).toHaveBeenCalledWith(newMessage);

    fireEvent.submit(formElement);

    expect(mockOnSend).toHaveBeenCalledWith(newMessage);
    expect(mockClear).toHaveBeenCalled();
  });
});
