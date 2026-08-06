import { useEffect, useState } from "react";
import { SupportContactCard } from "@/components/SupportContactCard";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useAuthStore } from "@/stores/authStore";
import { useSessionStore } from "@/stores/sessionStore";
import { useT } from "@/i18n/useT";
import * as api from "@/services/tauriAdapter";
import type { ContactInfo } from "@/services/tauriAdapter";

export function RevokedScreen() {
  const { revokeMessageFr, revokeMessageAr, installId, contact } = useAuthStore();
  const lang = useSessionStore((s) => s.language);
  const t = useT();
  const [id, setId] = useState(installId);
  const [info, setInfo] = useState<ContactInfo>(contact);

  useEffect(() => {
    void (async () => {
      try {
        const publicId = await api.getPublicInstallId();
        setId(publicId);
      } catch {
        /* ignore */
      }
      try {
        setInfo(await api.getSupportContact());
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const message =
    lang === "ar"
      ? revokeMessageAr || t("access.revoked")
      : revokeMessageFr || t("access.revoked");

  return (
    <div className="h-full w-full flex items-center justify-center px-6 bg-[#F0F5F5] relative">
      <div className="absolute top-6 end-6">
        <LanguageToggle />
      </div>
      <SupportContactCard
        installId={id}
        contact={info}
        reason="licence_blocked"
        title={t("access.revokedTitle")}
        message={message}
        hint={t("access.revokedHint")}
      />
    </div>
  );
}
