interface LogoMarkProps {
  size?: number;
  className?: string;
}

export function LogoMark({ size = 48, className = "" }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="100" height="100" rx="25" fill="#0E6E76" />
      {/* Back document — white */}
      <rect x="22" y="20" width="38" height="46" rx="6" fill="white" opacity="0.9" />
      {/* Front document — gold */}
      <rect x="38" y="34" width="38" height="46" rx="6" fill="#C9962B" />
      {/* Checkmark arrow */}
      <path
        d="M35 55 L45 65 L68 38"
        stroke="white"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

interface LogoLockupProps {
  size?: number;
  variant?: "dark" | "light";
  showSubtitle?: boolean;
  className?: string;
}

export function LogoLockup({
  size = 40,
  variant = "dark",
  showSubtitle = true,
  className = "",
}: LogoLockupProps) {
  const textColor = variant === "light" ? "text-white" : "text-[#1A2332]";
  const subColor = variant === "light" ? "text-white/60" : "text-[#64748B]";

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <LogoMark size={size} />
      <div className="flex flex-col">
        <span
          className={`font-[800] text-[${Math.round(size * 0.5)}px] leading-tight ${textColor}`}
          style={{ fontSize: Math.round(size * 0.5) }}
        >
          Tawthiq
        </span>
        {showSubtitle && (
          <span
            className={`text-[10px] ${subColor} tracking-wide`}
          >
            Rapprochement CNAM · OLIVEX
          </span>
        )}
      </div>
    </div>
  );
}
