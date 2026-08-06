import { useEffect, useState } from "react";
import { SupportContactCard } from "@/components/SupportContactCard";
import { SoftActionButton } from "@/components/SoftActionButton";
import { useAuthStore } from "@/stores/authStore";
import { useT } from "@/i18n/useT";
import * as api from "@/services/tauriAdapter";
import type { ContactInfo } from "@/services/tauriAdapter";

export function OfflineRequiredScreen() {
  const { installId, contact, setOfflineLocked, setAccessFromStatus } = useAuthStore();
  const t = useT();
  const [id, setId] = useState(installId);
  const [info, setInfo] = useState<ContactInfo>(contact);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setId(await api.getPublicInstallId());
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

  const retry = async () => {
    setChecking(true);
    try {
      const status = await api.checkAccess();
      setAccessFromStatus(status);
      if (!status.offline_locked && !status.revoked) {
        setOfflineLocked(false);
      }
    } catch {
      /* still offline */
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="h-full w-full flex items-center justify-center px-6 bg-[#F0F5F5]">
      <div className="flex flex-col items-center gap-4">
        <SupportContactCard
          installId={id}
          contact={info}
          reason="offline_expired"
          title={t("access.offlineTitle")}
          message={t("access.offlineMessage")}
          hint={t("access.offlineHint")}
        />
        <SoftActionButton
          onClick={() => void retry()}
          label={checking ? "…" : t("access.offlineRetry")}
          variant="primary"
        />
      </div>
    </div>
  );
}
