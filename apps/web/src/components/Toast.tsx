import type { FC } from "react";
import { AlertIcon, CheckIcon } from "./Icons";
import type { ApiRequestError } from "../api";

interface Props {
  toast: { type: "success" | "error"; message: string } | null;
  error: ApiRequestError | null;
  onDismissToast: () => void;
  onDismissError: () => void;
}

export const Toast: FC<Props> = ({ toast, error, onDismissToast, onDismissError }) => {
  return (
    <>
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 animate-fade-in">
          <div className="card flex items-start gap-2 px-3 py-2.5">
            <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-md border border-pay-line bg-pay-soft text-pay">
              <CheckIcon width={14} height={14} />
            </span>
            <div className="max-w-sm text-sm text-ink">{toast.message}</div>
            <button
              type="button"
              className="ml-1 rounded-md p-1 text-faint hover:text-ink"
              onClick={onDismissToast}
            >
              ×
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="fixed bottom-4 right-4 z-50 animate-fade-in">
          <div className="card flex items-start gap-2 border border-block-line bg-block-soft px-3 py-2.5 text-block">
            <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-md border border-block-line bg-block/20">
              <AlertIcon width={14} height={14} />
            </span>
            <div className="max-w-sm text-sm">
              <div className="font-semibold">{error.code}</div>
              <div className="text-xs opacity-90">{error.message}</div>
            </div>
            <button
              type="button"
              className="ml-1 rounded-md p-1 text-block/70 hover:text-block"
              onClick={onDismissError}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
};
