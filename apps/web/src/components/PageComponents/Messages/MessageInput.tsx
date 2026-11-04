import { FilePickerDialog } from "@components/PageComponents/Messages/FilePickerDialog.tsx";
import { Button } from "@components/UI/Button.tsx";
import { Input } from "@components/UI/Input.tsx";
import { buildFileMessage } from "@core/utils/fileMessage.ts";
import type { ConversationKey } from "@meshtastic/sdk";
import { useDraft } from "@meshtastic/sdk-react";
import { PaperclipIcon, SendIcon } from "lucide-react";
import { startTransition, useState } from "react";
import { useTranslation } from "react-i18next";

export interface MessageInputProps {
  onSend: (message: string) => void;
  conversation: ConversationKey;
  maxBytes: number;
}

export const MessageInput = ({
  onSend,
  conversation,
  maxBytes,
}: MessageInputProps) => {
  const { text: persistedDraft, setText, clear } = useDraft(conversation);
  const { t } = useTranslation("messages");

  const calculateBytes = (value: string) => new Blob([value]).size;

  const [localDraft, setLocalDraft] = useState(persistedDraft);
  const [messageBytes, setMessageBytes] = useState(() =>
    calculateBytes(persistedDraft),
  );
  const [isFileDialogOpen, setIsFileDialogOpen] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    const byteLength = calculateBytes(newValue);

    if (byteLength <= maxBytes) {
      setLocalDraft(newValue);
      setMessageBytes(byteLength);
      setText(newValue);
    }
  };

  const handleFileSelected = (fileName: string) => {
    const fileMessage = buildFileMessage(fileName, maxBytes);

    setLocalDraft(fileMessage);
    setMessageBytes(calculateBytes(fileMessage));
    setText(fileMessage);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!localDraft.trim()) {
      return;
    }
    setMessageBytes(0);

    startTransition(() => {
      onSend(localDraft.trim());
      setLocalDraft("");
      clear();
    });
  };

  return (
    <div className="flex gap-2">
      <form className="w-full" name="messageInput" onSubmit={handleSubmit}>
        <div className="flex grow gap-1">
          <Button
            type="button"
            variant="subtle"
            size="icon"
            aria-label={t("file.attach")}
            title={t("file.attach")}
            onClick={() => setIsFileDialogOpen(true)}
          >
            <PaperclipIcon size={16} />
          </Button>

          <label className="w-full" htmlFor="messageInput">
            <Input
              minLength={1}
              name="messageInput"
              placeholder={t("sendMessage.placeholder")}
              autoComplete="off"
              value={localDraft}
              onChange={handleInputChange}
            />
          </label>

          <label
            data-testid="byte-counter"
            htmlFor="messageInput"
            className="flex items-center w-20 p-1 text-sm place-content-end"
          >
            {messageBytes}/{maxBytes}
          </label>

          <Button type="submit" variant="default">
            <SendIcon size={16} />
          </Button>
        </div>
      </form>

      <FilePickerDialog
        open={isFileDialogOpen}
        onOpenChange={setIsFileDialogOpen}
        onFileSelected={handleFileSelected}
      />
    </div>
  );
};
