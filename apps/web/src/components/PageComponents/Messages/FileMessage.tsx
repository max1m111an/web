import { cn } from "@core/utils/cn.ts";
import { formatFileSize } from "@core/utils/fileMessage.ts";
import { Download, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";

interface FileMessageProps {
  fileName: string;
  content: string;
  sizeBytes: number;
}

function downloadTextFile(fileName: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const FileMessage = ({
  fileName,
  content,
  sizeBytes,
}: FileMessageProps) => {
  const { t } = useTranslation("messages");
  const downloadLabel = t("file.download", {
    fileName,
    interpolation: { escapeValue: false },
  });

  return (
    <button
      type="button"
      onClick={() => downloadTextFile(fileName, content)}
      aria-label={downloadLabel}
      title={downloadLabel}
      className={cn(
        "mt-1 flex w-full max-w-sm items-center gap-2.5 rounded-lg border px-3 py-2 text-left",
        "border-slate-200 bg-white/70 transition-colors duration-100 ease-in-out",
        "hover:border-slate-300 hover:bg-slate-100",
        "dark:border-slate-700 dark:bg-slate-800/80 dark:hover:border-slate-600 dark:hover:bg-slate-700/80",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
        "dark:focus-visible:ring-slate-500",
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300">
        <FileText className="size-5" aria-hidden="true" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
          {fileName}
        </span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">
          {formatFileSize(sizeBytes)}
        </span>
      </span>

      <Download
        className="size-4 shrink-0 text-slate-400 dark:text-slate-500"
        aria-hidden="true"
      />
    </button>
  );
};
