import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FC } from "react";
import { ApiRequestError, uploadInvoice } from "../api";
import type { DecisionView, IngestRequest, RunResult, UiCopy } from "../types";
import { AlertIcon, CheckIcon, CloseIcon, DocIcon, SpinnerIcon, UploadIcon } from "./Icons";

interface Props {
  open: boolean;
  onClose: () => void;
  categories: string[];
  ingest: UiCopy["ingest"];
  onUploaded: (run: RunResult, decision: DecisionView) => void;
}

const ACCEPTED = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";

const guessMime = (file: File): string => {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
};

export const UploadModal: FC<Props> = ({ open, onClose, categories, ingest, onUploaded }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [contentBase64, setContentBase64] = useState<string | null>(null);
  const [mime, setMime] = useState<string>("");
  const [text, setText] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setFile(null);
    setContentBase64(null);
    setMime("");
    setText("");
    setCategory("");
    setBusy(false);
    setDragging(false);
    setError(null);
  }, [open]);

  const clearFile = () => {
    setFile(null);
    setContentBase64(null);
    setMime("");
  };

  const readFile = (selected: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === "string" ? reader.result : "";
      const base64 = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
      if (!base64) {
        setError(ingest.missingInput);
        return;
      }
      setFile(selected);
      setMime(guessMime(selected));
      setContentBase64(base64);
      setError(null);
    };
    reader.onerror = () => setError(ingest.missingInput);
    reader.readAsDataURL(selected);
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (selected) {
      setText("");
      readFile(selected);
    }
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) {
      setText("");
      readFile(dropped);
    }
  };

  const hasInput = contentBase64 !== null || text.trim().length > 0;
  const canSubmit = hasInput && category.length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) {
      setError(ingest.missingInput);
      return;
    }
    setBusy(true);
    setError(null);
    const payload: IngestRequest = { category };
    if (file && contentBase64) {
      payload.fileName = file.name;
      payload.mime = mime;
      payload.contentBase64 = contentBase64;
    } else {
      payload.text = text;
    }
    try {
      const res = await uploadInvoice(payload);
      onUploaded(res.run, res.decision);
      onClose();
    } catch (e) {
      const err = e as ApiRequestError;
      if (err.code === "DUPLICATE_CONFIRMED") {
        setError(ingest.duplicate.replace("{id}", err.duplicateOf ?? ""));
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
        aria-label={ingest.cancel}
        disabled={busy}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ingest.title}
        className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-modal animate-rise"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-ink">{ingest.title}</h2>
            <p className="text-sm text-muted">{ingest.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={ingest.cancel}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface2 text-muted transition-colors hover:border-faint hover:text-ink"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
              dragging ? "border-primary bg-primary-soft" : "border-border bg-base/60 hover:border-primary/60 hover:bg-primary-soft/60"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={handleFileInput}
            />
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-primary">
              <UploadIcon width={18} height={18} />
            </span>
            <span className="text-sm font-semibold text-ink">{ingest.dropzoneTitle}</span>
            <span className="text-xs text-faint">{ingest.dropzoneHint}</span>
            {file && (
              <span className="chip max-w-full border-pay-line bg-pay-soft text-pay">
                <DocIcon width={12} height={12} className="shrink-0" />
                <span className="truncate">
                  {ingest.selectedFile}: {file.name}
                </span>
              </span>
            )}
          </div>

          <div>
            <label className="field-label" htmlFor="ingest-text">
              {ingest.pasteLabel}
            </label>
            <textarea
              id="ingest-text"
              rows={4}
              className="input resize-none"
              placeholder={ingest.pastePlaceholder}
              value={text}
              disabled={busy}
              onChange={(event) => {
                setText(event.target.value);
                if (event.target.value.trim().length > 0) clearFile();
              }}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="ingest-category">
              {ingest.categoryLabel}
            </label>
            <select
              id="ingest-category"
              className="input"
              value={category}
              disabled={busy}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">{ingest.categoryPlaceholder}</option>
              {categories.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-block-line bg-block-soft px-3 py-2.5 text-sm text-block">
              <AlertIcon width={16} height={16} className="mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface2/50 px-5 py-4">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            {ingest.cancel}
          </button>
          <button type="button" className="btn-primary" onClick={handleSubmit} disabled={busy || !canSubmit}>
            {busy ? <SpinnerIcon width={16} height={16} /> : <CheckIcon width={16} height={16} />}
            {ingest.submit}
          </button>
        </div>
      </div>
    </div>
  );
};
