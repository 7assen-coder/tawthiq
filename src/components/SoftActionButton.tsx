import type { ReactNode } from "react";

const styles = {
  primary:
    "bg-[var(--teal-light)] text-[var(--teal)] border-[var(--teal)]/25 hover:bg-[var(--teal)] hover:text-white hover:border-[var(--teal)]",
  muted:
    "bg-transparent text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--bg-app)] hover:text-[var(--text-primary)]",
  default:
    "bg-[var(--bg-card)] text-[var(--text-primary)] border-[var(--border)] hover:bg-[var(--bg-app)]",
} as const;

export function SoftActionButton({
  onClick,
  disabled,
  icon,
  label,
  variant = "default",
  className = "",
  type = "button",
}: {
  onClick?: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  variant?: keyof typeof styles;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2.5 h-11 px-4 rounded-lg text-[14px] font-semibold border transition-colors disabled:opacity-40 disabled:pointer-events-none ${styles[variant]} ${className}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export const softToggleActive =
  "bg-[var(--teal-light)] text-[var(--teal)] border-[var(--teal)]/25";
export const softToggleIdle =
  "bg-transparent text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--bg-app)] hover:text-[var(--text-primary)]";
export const softControlBase =
  "inline-flex items-center justify-center gap-2.5 h-11 px-4 rounded-lg text-[14px] font-semibold border transition-colors";
