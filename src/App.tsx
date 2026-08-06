import { useState, useEffect } from "react";
import { SplashScreen } from "@/screens/SplashScreen";
import { PinScreen } from "@/screens/PinScreen";
import { AppShell } from "@/components/layout/AppShell";
import { RevokedScreen } from "@/screens/RevokedScreen";
import { OfflineRequiredScreen } from "@/screens/OfflineRequiredScreen";
import { useAuthStore } from "@/stores/authStore";
import * as api from "@/services/tauriAdapter";
import { useT } from "@/i18n/useT";

type AppPhase = "splash" | "pin" | "main";

export default function App() {
  const {
    isAuthenticated,
    hasExistingPin,
    setHasExistingPin,
    setLoading,
    isLoading,
    accessRevoked,
    offlineLocked,
    setAccessFromStatus,
  } = useAuthStore();
  const [phase, setPhase] = useState<AppPhase>("splash");
  const t = useT();

  useEffect(() => {
    (async () => {
      try {
        const status = await api.checkAccess();
        setAccessFromStatus(status);
      } catch {
        /* offline / unsigned */
      }
      try {
        const exists = await api.hasPin();
        setHasExistingPin(exists);
      } catch {
        setHasExistingPin(null);
      }
      setLoading(false);
    })();
  }, [setHasExistingPin, setLoading, setAccessFromStatus]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void (async () => {
      try {
        const status = await api.checkAccess();
        setAccessFromStatus(status);
        if (status.revoked || status.offline_locked) {
          await api.lockSession();
        }
      } catch {
        /* offline */
      }
    })();
  }, [isAuthenticated, setAccessFromStatus]);

  useEffect(() => {
    if (isAuthenticated) {
      setPhase("main");
    } else if (phase === "main") {
      setPhase("pin");
    }
  }, [isAuthenticated, phase]);

  if (phase === "splash") {
    return <SplashScreen onComplete={() => setPhase("pin")} />;
  }

  if (accessRevoked) {
    return <RevokedScreen />;
  }

  if (offlineLocked) {
    return <OfflineRequiredScreen />;
  }

  if (!isAuthenticated) {
    if (isLoading) {
      return (
        <div className="h-full w-full flex items-center justify-center bg-[#F0F5F5]">
          <div className="w-6 h-6 border-2 border-[var(--teal)] border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
    if (hasExistingPin === null) {
      return (
        <div className="h-full w-full flex items-center justify-center bg-[#F0F5F5] px-6">
          <p className="text-[15px] text-[var(--red)] font-semibold text-center max-w-sm">
            {t("pin.dbError")}
          </p>
        </div>
      );
    }
    return <PinScreen />;
  }

  return <AppShell />;
}
