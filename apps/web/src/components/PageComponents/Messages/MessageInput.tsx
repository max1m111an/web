import { FilePickerDialog } from "@components/PageComponents/Messages/FilePickerDialog.tsx";
import { Button } from "@components/UI/Button.tsx";
import { Input } from "@components/UI/Input.tsx";
import {
  buildFileMessage,
  buildMessageWithFile,
  formatFileSize,
  truncateToUtf8Bytes,
} from "@core/utils/fileMessage.ts";
import type { ConversationKey } from "@meshtastic/sdk";
import { useDraft } from "@meshtastic/sdk-react";
import { FileText, PaperclipIcon, SendIcon, X } from "lucide-react";
import { startTransition, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

export interface MessageInputProps {
  onSend: (message: string) => void;
  conversation: ConversationKey;
  maxBytes: number;
}

interface PendingFile {
  name: string;
  sizeBytes: number;
}

function calculateBytes(value: string): number {
  return new Blob([value]).size;
}

export const MessageInput = ({
  onSend,
  conversation,
  maxBytes,
}: MessageInputProps) => {
  const { text: persistedDraft, setText, clear } = useDraft(conversation);
  const { t } = useTranslation("messages");

  const [localDraft, setLocalDraft] = useState(persistedDraft);
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const [isFileDialogOpen, setIsFileDialogOpen] = useState(false);

  const pendingFileMessage = useMemo(
    () => (pendingFile ? buildFileMessage(pendingFile.name, maxBytes) : ""),
    [pendingFile, maxBytes],
  );

  const messageBytes = useMemo(
    () =>
      pendingFile
        ? calculateBytes(
            buildMessageWithFile(localDraft, pendingFile.name, maxBytes),
          )
        : calculateBytes(localDraft),
    [localDraft, pendingFile, maxBytes],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    const nextMessage = pendingFile
      ? newValue
        ? `${newValue}\n${pendingFileMessage}`
        : pendingFileMessage
      : newValue;

    if (calculateBytes(nextMessage) <= maxBytes) {
      setLocalDraft(newValue);
      setText(newValue);
    }
  };

  const handleFileSelected = (fileName: string, sizeBytes: number) => {
    const fileMessage = buildFileMessage(fileName, maxBytes);
    const availableTextBytes =
      maxBytes - calculateBytes(fileMessage) - Number(Boolean(localDraft));
    const nextDraft =
      availableTextBytes > 0
        ? truncateToUtf8Bytes(localDraft, availableTextBytes)
        : "";

    setPendingFile({ name: fileName, sizeBytes });

    if (nextDraft !== localDraft) {
      setLocalDraft(nextDraft);
      setText(nextDraft);
    }
  };

  const handleFileRemove = () => {
    setPendingFile(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const message = (
      pendingFile
        ? buildMessageWithFile(localDraft, pendingFile.name, maxBytes)
        : localDraft
    ).trim();

    if (!message) {
      return;
    }

    startTransition(() => {
      onSend(message);
      setLocalDraft("");
      setPendingFile(null);
      clear();
    });
  };

  const removeFileLabel = pendingFile
    ? t("file.remove", {
        fileName: pendingFile.name,
        interpolation: { escapeValue: false },
      })
    : "";

  return (
    <div className="flex gap-2">
      <form className="w-full" name="messageInput" onSubmit={handleSubmit}>
        {pendingFile && (
          <div className="mb-2 flex items-center gap-2">
            <div
              data-testid="pending-file"
              title={pendingFile.name}
              className="relative flex size-24 flex-col items-center justify-center gap-0.5 rounded-lg border border-slate-200 bg-white/70 p-2 text-slate-500 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300"
            >
              <FileText className="size-5 shrink-0" aria-hidden="true" />
              <span className="w-full truncate text-center text-[11px] leading-tight font-medium text-slate-800 dark:text-slate-100">
                {pendingFile.name}
              </span>
              <span className="text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                {formatFileSize(pendingFile.sizeBytes)}
              </span>
              <button
                type="button"
                onClick={handleFileRemove}
                aria-label={removeFileLabel}
                title={removeFileLabel}
                className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors duration-100 ease-in-out hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        <div className="flex grow gap-1">
          <Button
            type="button"
            variant="subtle"
            size="icon"
            aria-label={t("file.attach")}
            title={t("file.attach")}
            disabled={pendingFile !== null}
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
