import type { FC } from "react";
import { ChartIcon, DocIcon, PanelIcon, ResetIcon, ShieldIcon, UploadIcon, type IconProps } from "./Icons";

interface Props {
  brand: string;
  org: string;
  subtitle: string;
  sectionsLabel: string;
  nav: { kpis: string; invoices: string; inspector: string };
  uploadButton: string;
  resetButton: string;
  resetConfirm: string;
  footer: string;
  onUpload: () => void;
  onReset: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: FC<IconProps>;
}

const scrollToSection = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

export const Sidebar: FC<Props> = ({
  brand,
  org,
  subtitle,
  sectionsLabel,
  nav,
  uploadButton,
  resetButton,
  resetConfirm,
  footer,
  onUpload,
  onReset
}) => {
  const items: NavItem[] = [
    { id: "kpis", label: nav.kpis, icon: ChartIcon },
    { id: "invoices", label: nav.invoices, icon: DocIcon },
    { id: "inspector", label: nav.inspector, icon: PanelIcon }
  ];

  const handleReset = () => {
    if (window.confirm(resetConfirm)) onReset();
  };

  return (
    <aside className="sticky top-10 flex h-[calc(100vh-40px)] w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-border bg-surface p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/40 bg-primary-soft text-primary">
            <ShieldIcon width={18} height={18} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-ink">{brand}</div>
            <div className="truncate text-xs text-muted">{org}</div>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-faint">{subtitle}</p>
      </div>

      <button type="button" className="btn-primary w-full" onClick={onUpload}>
        <UploadIcon />
        {uploadButton}
      </button>

      <nav className="flex flex-col gap-1">
        <div className="section-title px-3 pb-1.5">{sectionsLabel}</div>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => scrollToSection(item.id)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-primary-soft hover:text-ink"
            >
              <Icon width={16} height={16} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <button type="button" className="btn-danger w-full" onClick={handleReset}>
          <ResetIcon />
          {resetButton}
        </button>
        <p className="text-[11px] leading-relaxed text-faint">{footer}</p>
      </div>
    </aside>
  );
};
