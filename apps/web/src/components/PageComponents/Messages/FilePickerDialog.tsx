import { Button } from "@components/UI/Button.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@components/UI/Dialog.tsx";
import { cn } from "@core/utils/cn.ts";
import { UploadCloud } from "lucide-react";
import type { ChangeEvent, DragEvent } from "react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export interface FilePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFileSelected: (fileName: string, sizeBytes: number) => void;
}

export const FilePickerDialog = ({
  open,
  onOpenChange,
  onFileSelected,
}: FilePickerDialogProps) => {
  const { t } = useTranslation("messages");
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const selectFile = (file: File | undefined) => {
    if (!file) {
      return;
    }

    onFileSelected(file.name, file.size);
    onOpenChange(false);
  };

  const openFilePicker = () => {
    inputRef.current?.click();
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    selectFile(event.target.files?.[0]);
    // Allow selecting the same file again.
    event.target.value = "";
  };

  const handleDragOver = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => event.preventDefault()}
      >
        <DialogClose />
        <DialogHeader>
          <DialogTitle>{t("file.dialog.title")}</DialogTitle>
          <DialogDescription>{t("file.dialog.description")}</DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={openFilePicker}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          data-testid="file-drop-zone"
          className={cn(
            "flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors duration-100 ease-in-out",
            isDragging
              ? "border-sky-500 bg-sky-50 dark:border-sky-400 dark:bg-sky-950/40"
              : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900/40 dark:hover:border-slate-500 dark:hover:bg-slate-800/60",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500",
          )}
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-300">
            <UploadCloud className="size-6" aria-hidden="true" />
          </span>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {isDragging
              ? t("file.dialog.dropActive")
              : t("file.dialog.dropHint")}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {t("file.dialog.chooseHint")}
          </span>
        </button>

        <input
          ref={inputRef}
          type="file"
          className="hidden"
          data-testid="file-input"
          onChange={handleInputChange}
        />

        <DialogFooter>
          <Button variant="outline" onClick={openFilePicker}>
            {t("file.dialog.choose")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
