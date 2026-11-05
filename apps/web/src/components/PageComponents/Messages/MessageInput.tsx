import { FilePickerDialog } from "@components/PageComponents/Messages/FilePickerDialog.tsx";
import { Button } from "@components/UI/Button.tsx";
import { Input } from "@components/UI/Input.tsx";
import { formatFileSize } from "@core/utils/fileMessage.ts";
import type { ConversationKey } from "@meshtastic/sdk";
import { useDraft } from "@meshtastic/sdk-react";
import { FileText, PaperclipIcon, SendIcon, X } from "lucide-react";
import { startTransition, useState } from "react";
import { useTranslation } from "react-i18next";

export interface MessageInputProps {
  onSend: (message: string) => void | Promise<void>;
  /**
   * Sends file attachments over the mesh file-transfer protocol. When
   * omitted, the attach button is hidden (e.g. broadcast chats, which cannot
   * provide the stop-and-wait semantics transfers need).
   */
  onSendFiles?: (files: File[]) => void | Promise<void>;
  conversation: ConversationKey;
  maxBytes: number;
}

function calculateBytes(value: string): number {
  return new Blob([value]).size;
}

export const MessageInput = ({
  onSend,
  onSendFiles,
  conversation,
  maxBytes,
}: MessageInputProps) => {
  const { text: persistedDraft, setText, clear } = useDraft(conversation);
  const { t } = useTranslation("messages");

  const [localDraft, setLocalDraft] = useState(persistedDraft);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isFileDialogOpen, setIsFileDialogOpen] = useState(false);
  const attachmentsEnabled = onSendFiles !== undefined;

  const messageBytes = calculateBytes(localDraft);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;

    if (calculateBytes(newValue) <= maxBytes) {
      setLocalDraft(newValue);
      setText(newValue);
    }
  };

  const handleFilesSelected = (files: File[]) => {
    if (!files.length) {
      return;
    }

    setPendingFiles((previous) => [...previous, ...files]);
  };

  const handleFileRemove = (index: number) => {
    setPendingFiles((previous) =>
      previous.filter((_, fileIndex) => fileIndex !== index),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = localDraft.trim();

    const filesToSend = attachmentsEnabled ? pendingFiles : [];

    if (!text && filesToSend.length === 0) {
      return;
    }

    startTransition(() => {
      setLocalDraft("");
      setPendingFiles([]);
      clear();
    });

    if (text) {
      await onSend(text);
    }

    if (filesToSend.length > 0 && onSendFiles) {
      await onSendFiles(filesToSend);
    }
  };

  return (
    <div className="flex gap-2">
      <form className="w-full" name="messageInput" onSubmit={handleSubmit}>
        {pendingFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap items-start gap-2">
            {pendingFiles.map((file, index) => {
              const removeFileLabel = t("file.remove", {
                fileName: file.name,
                interpolation: { escapeValue: false },
              });

              return (
                <div
                  key={`${file.name}-${index}`}
                  data-testid="pending-file"
                  title={file.name}
                  className="relative flex size-24 flex-col items-center justify-center gap-0.5 rounded-lg border border-slate-200 bg-white/70 p-2 text-slate-500 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300"
                >
                  <FileText className="size-5 shrink-0" aria-hidden="true" />
                  <span className="w-full truncate text-center text-[11px] leading-tight font-medium text-slate-800 dark:text-slate-100">
                    {file.name}
                  </span>
                  <span className="text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                    {formatFileSize(file.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleFileRemove(index)}
                    aria-label={removeFileLabel}
                    title={removeFileLabel}
                    className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors duration-100 ease-in-out hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex grow gap-1">
          {attachmentsEnabled && (
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
          )}

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

      {attachmentsEnabled && (
        <FilePickerDialog
          open={isFileDialogOpen}
          onOpenChange={setIsFileDialogOpen}
          onFilesSelected={handleFilesSelected}
        />
      )}
    </div>
  );
};
