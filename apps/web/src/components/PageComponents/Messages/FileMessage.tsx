import { cn } from "@core/utils/cn.ts";
import { formatFileSize } from "@core/utils/fileMessage.ts";
import { useFileTransfer } from "@meshtastic/sdk-react";
import { Download, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface FileMessageProps {
  fileName: string;
  sizeBytes: number;
  /** Decoded mesh file bytes, once available. */
  data?: Uint8Array;
  /** Legacy plain-text payload (`file::<text>` messages). */
  content?: string;
  /** Mesh transfer id, used to correlate live progress. */
  transferId?: number;
  /** Whether this is a legacy text-backed file message. */
  legacy?: boolean;
  /** The chat message itself failed. */
  failed?: boolean;
}

function triggerDownload(
  fileName: string,
  bytes: BlobPart,
  type: string,
): void {
  const blob = new Blob([bytes], { type });
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
  sizeBytes,
  data,
  content = "",
  transferId,
  legacy = false,
  failed = false,
}: FileMessageProps) => {
  const { t } = useTranslation("messages");
  const transfers = useFileTransfer();
  const live =
    transferId === undefined
      ? undefined
      : transfers.find((transfer) => transfer.id === transferId);

  const resolvedData =
    data ?? (live?.status === "complete" ? live.data : undefined);
  const totalBytes = sizeBytes || live?.size || 0;
  const transferredBytes = resolvedData?.byteLength ?? live?.transferred ?? 0;
  const isFailed = failed || live?.status === "failed";
  const isTransferring = !resolvedData && !isFailed && live !== undefined;
  const canDownloadText = legacy || content.length > 0;
  const canDownload = resolvedData !== undefined || canDownloadText;

  const downloadLabel = t("file.download", {
    fileName,
    interpolation: { escapeValue: false },
  });

  const handleDownload = () => {
    if (resolvedData) {
      triggerDownload(
        fileName,
        new Uint8Array(resolvedData),
        "application/octet-stream",
      );
      return;
    }
    if (canDownloadText) {
      triggerDownload(fileName, content, "text/plain;charset=utf-8");
    }
  };

  const percent =
    totalBytes > 0
      ? Math.min(100, Math.round((transferredBytes / totalBytes) * 100))
      : 0;

  const statusText = isFailed
    ? t("file.transfer.failed")
    : isTransferring
      ? t("file.transfer.progress", { percent })
      : canDownload
        ? undefined
        : t("file.transfer.unavailable");

  const className = cn(
    "mt-1 flex w-full max-w-sm items-center gap-2.5 rounded-lg border px-3 py-2 text-left",
    "border-slate-200 bg-white/70 transition-colors duration-100 ease-in-out",
    canDownload && "hover:border-slate-300 hover:bg-slate-100",
    "dark:border-slate-700 dark:bg-slate-800/80",
    canDownload && "dark:hover:border-slate-600 dark:hover:bg-slate-700/80",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
    "dark:focus-visible:ring-slate-500",
    isFailed && "border-red-300 dark:border-red-800",
  );

  const body = (
    <>
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300",
          isFailed && "text-red-500 dark:text-red-400",
        )}
      >
        <FileText className="size-5" aria-hidden="true" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
          {fileName}
        </span>
        <span
          className={cn(
            "block text-xs",
            isFailed
              ? "text-red-500 dark:text-red-400"
              : "text-slate-500 dark:text-slate-400",
          )}
        >
          {statusText ?? formatFileSize(totalBytes)}
        </span>
        {isTransferring && (
          <progress
            className="mt-1 block h-1 w-full appearance-none overflow-hidden rounded-full [&::-moz-progress-bar]:bg-sky-500 [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:bg-sky-500 dark:[&::-webkit-progress-bar]:bg-slate-700"
            value={percent}
            max={100}
            aria-label={statusText}
          />
        )}
      </span>

      {canDownload && (
        <Download
          className="size-4 shrink-0 text-slate-400 dark:text-slate-500"
          aria-hidden="true"
        />
      )}
    </>
  );

  if (!canDownload) {
    return (
      <div className={className} data-testid="file-message">
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      aria-label={downloadLabel}
      title={downloadLabel}
      data-testid="file-message"
      className={className}
    >
      {body}
    </button>
  );
};
