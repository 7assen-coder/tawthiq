import { SoftActionButton } from "@/components/SoftActionButton";
import { LogoMark } from "@/components/Logo";
import type { ContactInfo } from "@/services/tauriAdapter";
import { useT } from "@/i18n/useT";

interface SupportContactCardProps {
  installId: string;
  contact: ContactInfo;
  reason: "licence_blocked" | "pin_help" | "offline_expired";
  title: string;
  message: string;
  hint?: string;
}

function waUrl(phone: string, text: string) {
  const digits = phone.replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function SupportContactCard({
  installId,
  contact,
  reason,
  title,
  message,
  hint,
}: SupportContactCardProps) {
  const t = useT();
  const phone = contact.whatsapp || "+22241824343";
  const email = contact.email || "MoHasseenn@gmail.com";
  const template = `Tawthiq — Install ID: ${installId} — reason: ${reason}`;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(installId);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 max-w-md text-center">
      <LogoMark size={56} />
      <h2 className="text-[20px] font-bold text-[var(--text-primary)]">{title}</h2>
      <p className="text-[15px] text-[var(--red)] font-semibold leading-relaxed">{message}</p>
      {hint && <p className="text-[13px] text-[var(--text-faint)]">{hint}</p>}

      <div className="w-full rounded-xl bg-[var(--bg-card)] border border-[var(--border)] p-4 text-left">
        <p className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">
          {t("support.installId")}
        </p>
        <p className="text-[13px] font-mono break-all text-[var(--text-primary)]">{installId || "…"}</p>
        <div className="mt-3">
          <SoftActionButton onClick={() => void copyId()} label={t("support.copyId")} variant="muted" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 justify-center">
        <SoftActionButton
          label={t("support.whatsapp")}
          variant="primary"
          onClick={() => window.open(waUrl(phone, template), "_blank")}
        />
        <SoftActionButton
          label={t("support.email")}
          variant="muted"
          onClick={() => {
            window.location.href = `mailto:${email}?subject=${encodeURIComponent("Tawthiq support")}&body=${encodeURIComponent(template)}`;
          }}
        />
      </div>
      <p className="text-[12px] text-[var(--text-faint)]">
        {phone} · {email}
      </p>
    </div>
  );
}
