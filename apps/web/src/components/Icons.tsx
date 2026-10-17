import type { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props
  };
}

export const ShieldIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
    <path d="M9.5 12l1.8 1.8L15 10" />
  </svg>
);

export const LockIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    <path d="M12 14.5v2" />
  </svg>
);

export const AlertIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 4l9 16H3l9-16z" />
    <path d="M12 10v4" />
    <path d="M12 17.2v.01" />
  </svg>
);

export const CheckIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
);

export const XIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const CloseIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const FingerprintIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 4a8 8 0 0 0-5.7 2.4" />
    <path d="M12 4a8 8 0 0 1 5.7 2.4" />
    <path d="M5 10a7 7 0 0 1 .4-2.3" />
    <path d="M19 10a7 7 0 0 0-.4-2.3" />
    <path d="M7 19a9 9 0 0 1-1.6-3" />
    <path d="M17 19a9 9 0 0 0 1.6-3" />
    <path d="M9 20a5 5 0 0 1-1-3" />
    <path d="M15 20a5 5 0 0 0 1-3" />
    <path d="M12 8v6" />
  </svg>
);

export const BanIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M6 6l12 12" />
  </svg>
);

export const ScaleIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 4v16" />
    <path d="M7 20h10" />
    <path d="M4 8h16" />
    <path d="M6 8l-2.5 5h5L6 8z" />
    <path d="M18 8l-2.5 5h5L18 8z" />
  </svg>
);

export const SpinnerIcon = (p: IconProps) => (
  <svg {...base(p)} className={`animate-spin ${p.className ?? ""}`}>
    <circle cx="12" cy="12" r="8.5" opacity="0.25" />
    <path d="M20.5 12a8.5 8.5 0 0 0-8.5-8.5" />
  </svg>
);

export const DocIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20V4a.5.5 0 0 1 .5-.5z" />
    <path d="M14 3.5V8h4" />
    <path d="M9.5 12.5h5M9.5 16h5" />
  </svg>
);

export const UploadIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 15.5V4" />
    <path d="M7.5 8.5L12 4l4.5 4.5" />
    <path d="M4 14v4.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V14" />
  </svg>
);

export const ResetIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 4v6h6" />
    <path d="M5.51 15a9 9 0 1 0 2.13-9.36L3 10" />
  </svg>
);

export const ChartIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3.5 20.5h17" />
    <path d="M7 20.5V12.5" />
    <path d="M12 20.5V6.5" />
    <path d="M17 20.5V15.5" />
  </svg>
);

export const PanelIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M14 4.5v15" />
  </svg>
);
