import type { FC } from "react";
import { LockIcon } from "./Icons";

interface Props {
  title: string;
  text: string;
  short: string;
}

export const SafetyBanner: FC<Props> = ({ title, text, short }) => {
  return (
    <div className="sticky top-0 z-40 border-b border-amber-500/30 bg-gradient-to-r from-escalate-soft via-surface to-surface">
      <div className="mx-auto flex max-w-screen-2xl items-center gap-3 px-4 py-2 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">
          <LockIcon className="text-amber-200" />
          {short}
        </span>
        <div className="flex min-w-0 items-center gap-2">
          <strong className="text-ink">{title}</strong>
          <span className="hidden truncate text-muted md:inline">{text}</span>
        </div>
      </div>
    </div>
  );
};
