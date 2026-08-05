import { LogoMark } from "@/components/Logo";
import { useAuthStore } from "@/stores/authStore";
import { useSessionStore } from "@/stores/sessionStore";
import { useT } from "@/i18n/useT";

export function RevokedScreen() {
  const { revokeMessageFr, revokeMessageAr } = useAuthStore();
  const lang = useSessionStore((s) => s.language);
  const t = useT();
  const message = lang === "ar" ? revokeMessageAr || t("access.revoked") : revokeMessageFr || t("access.revoked");

  return (
    <div className="h-full w-full flex items-center justify-center px-6 bg-[#F0F5F5]">
      <div className="flex flex-col items-center gap-4 max-w-md text-center">
        <LogoMark size={56} />
        <h2 className="text-[20px] font-bold text-[var(--text-primary)]">{t("access.revokedTitle")}</h2>
        <p className="text-[15px] text-[var(--red)] font-semibold leading-relaxed">{message}</p>
        <p className="text-[13px] text-[var(--text-faint)]">{t("access.revokedHint")}</p>
      </div>
    </div>
  );
}
