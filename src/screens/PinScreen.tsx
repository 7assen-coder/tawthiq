import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { LogoMark } from "@/components/Logo";
import { SupportContactCard } from "@/components/SupportContactCard";
import { SoftActionButton } from "@/components/SoftActionButton";
import { useAuthStore } from "@/stores/authStore";
import * as api from "@/services/tauriAdapter";
import type { ContactInfo } from "@/services/tauriAdapter";
import { useT } from "@/i18n/useT";
import { useSessionStore } from "@/stores/sessionStore";

type Mode = "pin" | "recoveryShown" | "forgot" | "forceNewPin";

export function PinScreen() {
  const { hasExistingPin, setAuthenticated, setHasExistingPin, contact } = useAuthStore();
  const [digits, setDigits] = useState<string[]>(["", "", "", ""]);
  const [error, setError] = useState("");
  const [isSetup] = useState(!hasExistingPin);
  const [confirmPin, setConfirmPin] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [mode, setMode] = useState<Mode>("pin");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [shownRecovery, setShownRecovery] = useState<string | null>(null);
  const [tempCode, setTempCode] = useState("");
  const [forgotTab, setForgotTab] = useState<"recovery" | "temp">("recovery");
  const [installId, setInstallId] = useState("");
  const [support, setSupport] = useState<ContactInfo>(contact);
  const [pendingNewPin, setPendingNewPin] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useT();
  const lang = useSessionStore((s) => s.language);

  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    void (async () => {
      try {
        setInstallId(await api.getPublicInstallId());
      } catch {
        /* ignore */
      }
      try {
        setSupport(await api.getSupportContact());
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const title = isSetup
    ? confirmPin !== null
      ? t("pin.confirm")
      : t("pin.create")
    : mode === "forceNewPin"
      ? t("pin.create")
      : t("pin.enter");

  const arabicTitle = isSetup
    ? confirmPin !== null
      ? t("pin.confirmAr")
      : t("pin.createAr")
    : t("pin.enterAr");

  const finishWithRecovery = () => {
    setMode("pin");
    setAuthenticated(true);
  };

  const handleComplete = useCallback(
    async (pin: string) => {
      if (mode === "forceNewPin") {
        if (pendingNewPin === null) {
          setPendingNewPin(pin);
          setDigits(["", "", "", ""]);
          return;
        }
        if (pin !== pendingNewPin) {
          setError(t("pin.mismatch"));
          setShake(true);
          setTimeout(() => {
            setShake(false);
            setDigits(["", "", "", ""]);
            setPendingNewPin(null);
            setError("");
          }, 600);
          return;
        }
        try {
          if (forgotTab === "recovery") {
            const res = await api.applyRecoveryCode(recoveryCode, pin);
            setShownRecovery(res.recovery_code);
            setMode("recoveryShown");
            setHasExistingPin(true);
          } else {
            await api.applyTempReset(tempCode, pin);
            setAuthenticated(true);
            setMode("pin");
          }
        } catch {
          setError(t("pin.wrong"));
          setPendingNewPin(null);
          setDigits(["", "", "", ""]);
        }
        return;
      }

      if (isSetup) {
        if (confirmPin === null) {
          setConfirmPin(pin);
          setDigits(["", "", "", ""]);
          return;
        }
        if (pin !== confirmPin) {
          setError(t("pin.mismatch"));
          setShake(true);
          setTimeout(() => {
            setShake(false);
            setDigits(["", "", "", ""]);
            setConfirmPin(null);
            setError("");
          }, 600);
          return;
        }
        try {
          const res = await api.setupPin(pin);
          setShownRecovery(res.recovery_code);
          setMode("recoveryShown");
          setHasExistingPin(true);
        } catch {
          setError(t("pin.unavailable"));
        }
      } else {
        try {
          const result = await api.verifyPin(pin);
          if (result.ok) {
            setAuthenticated(true);
          } else if (result.error === "LOCKED" && result.retry_after_secs) {
            setError(t("pin.locked").replace("{s}", String(result.retry_after_secs)));
            setShake(true);
            setTimeout(() => {
              setShake(false);
              setDigits(["", "", "", ""]);
            }, 600);
          } else {
            setError(t("pin.wrong"));
            setShake(true);
            setTimeout(() => {
              setShake(false);
              setDigits(["", "", "", ""]);
              setError("");
            }, 600);
          }
        } catch {
          setError(t("pin.unavailable"));
        }
      }
    },
    [
      mode,
      pendingNewPin,
      forgotTab,
      recoveryCode,
      tempCode,
      isSetup,
      confirmPin,
      setAuthenticated,
      setHasExistingPin,
      t,
    ]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (mode === "forgot" || mode === "recoveryShown") return;
      if (e.key === "Backspace") {
        setDigits((prev) => {
          const next = [...prev];
          const lastFilled = next.findLastIndex((d) => d !== "");
          if (lastFilled >= 0) next[lastFilled] = "";
          return next;
        });
        setError("");
        return;
      }

      if (e.key === "Enter") {
        const pin = digits.join("");
        if (pin.length === 4) void handleComplete(pin);
        return;
      }

      if (!/^\d$/.test(e.key)) return;

      setDigits((prev) => {
        const next = [...prev];
        const firstEmpty = next.findIndex((d) => d === "");
        if (firstEmpty >= 0) {
          next[firstEmpty] = e.key;
          if (firstEmpty === 3) {
            setTimeout(() => void handleComplete(next.join("")), 150);
          }
        }
        return next;
      });
      setError("");
    },
    [digits, handleComplete, mode]
  );

  const startForceNewPin = () => {
    setMode("forceNewPin");
    setPendingNewPin(null);
    setDigits(["", "", "", ""]);
    setError("");
  };

  if (mode === "recoveryShown" && shownRecovery) {
    return (
      <div className="h-full w-full flex items-center justify-center px-6 bg-[#F0F5F5]">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <LogoMark size={56} />
          <h2 className="text-[18px] font-bold">{t("pin.recoveryTitle")}</h2>
          <p className="text-[13px] text-[var(--text-faint)]">{t("pin.recoveryHint")}</p>
          <p className="text-[22px] font-mono font-bold tracking-wider text-[var(--teal)]">
            {shownRecovery}
          </p>
          <SoftActionButton
            label={t("support.copyId")}
            variant="muted"
            onClick={() => void navigator.clipboard.writeText(shownRecovery)}
          />
          <SoftActionButton
            label={t("pin.recoveryContinue")}
            variant="primary"
            onClick={() => finishWithRecovery()}
          />
        </div>
      </div>
    );
  }

  if (mode === "forgot") {
    return (
      <div className="h-full w-full overflow-y-auto px-6 py-8 bg-[#F0F5F5]">
        <div className="max-w-md mx-auto flex flex-col gap-5">
          <SupportContactCard
            installId={installId}
            contact={support}
            reason="pin_help"
            title={t("pin.forgotTitle")}
            message={t("pin.forgotMessage")}
            hint={t("pin.forgotHint")}
          />
          <div className="flex gap-2 justify-center">
            <SoftActionButton
              label={t("pin.useRecovery")}
              variant={forgotTab === "recovery" ? "primary" : "muted"}
              onClick={() => setForgotTab("recovery")}
            />
            <SoftActionButton
              label={t("pin.useTemp")}
              variant={forgotTab === "temp" ? "primary" : "muted"}
              onClick={() => setForgotTab("temp")}
            />
          </div>
          {forgotTab === "recovery" ? (
            <input
              className="w-full h-11 px-3 rounded-lg border border-[var(--border)] bg-white font-mono"
              placeholder="TW-XXXX-XXXX"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
            />
          ) : (
            <input
              className="w-full h-11 px-3 rounded-lg border border-[var(--border)] bg-white font-mono"
              placeholder="XXXX-XXXX"
              value={tempCode}
              onChange={(e) => setTempCode(e.target.value.toUpperCase())}
            />
          )}
          <div className="flex gap-2 justify-center">
            <SoftActionButton
              label={t("pin.forgotContinue")}
              variant="primary"
              onClick={() => {
                if (forgotTab === "recovery" && recoveryCode.trim().length < 8) {
                  setError(t("pin.wrong"));
                  return;
                }
                if (forgotTab === "temp" && tempCode.trim().length < 4) {
                  setError(t("pin.wrong"));
                  return;
                }
                startForceNewPin();
              }}
            />
            <SoftActionButton
              label={t("settings.pinCancel")}
              variant="muted"
              onClick={() => {
                setMode("pin");
                setError("");
              }}
            />
          </div>
          {error && <p className="text-center text-[var(--red)] text-[13px]">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full w-full flex items-center justify-center"
      style={{
        background:
          "var(--pin-bg, radial-gradient(ellipse at center, #F0F5F5 0%, #E8EDEE 50%, #DFE5E6 100%))",
      }}
      onClick={() => inputRef.current?.focus()}
    >
      <div className="flex flex-col items-center gap-6">
        <LogoMark size={56} />

        <div className="text-center">
          <h2 className="text-[18px] font-bold text-[var(--text-primary)]">{title}</h2>
          {lang === "fr" && (
            <p className="text-[13px] text-[var(--text-faint)] mt-1" dir="rtl">
              {arabicTitle}
            </p>
          )}
          {mode === "forceNewPin" && (
            <p className="text-[12px] text-[var(--text-faint)] mt-2">{t("pin.forceNewHint")}</p>
          )}
        </div>

        <motion.div
          className="flex gap-3"
          animate={shake ? { x: [0, -12, 12, -12, 12, -6, 6, 0] } : {}}
          transition={{ duration: 0.3 }}
        >
          {digits.map((digit, i) => (
            <motion.div
              key={i}
              className={`w-14 h-16 rounded-xl border-2 flex items-center justify-center text-[24px] font-[800] transition-colors ${
                digit
                  ? "border-[var(--teal)] bg-[var(--bg-card)] text-[var(--text-primary)]"
                  : "border-[var(--border)] bg-[var(--bg-card)]/80"
              }`}
              animate={digit ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 0.15 }}
            >
              {digit ? "•" : <span className="w-2 h-2 rounded-full bg-[var(--text-faint)]" />}
            </motion.div>
          ))}
        </motion.div>

        {error && <p className="text-[var(--red)] text-[13px] font-medium">{error}</p>}

        <p className="text-[12px] text-[var(--text-faint)] max-w-[260px] text-center">
          {t("pin.hint")}
        </p>

        {!isSetup && mode === "pin" && (
          <button
            type="button"
            className="text-[13px] font-semibold text-[var(--teal)]"
            onClick={() => setMode("forgot")}
          >
            {t("pin.forgotLink")}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        className="absolute opacity-0 w-0 h-0"
        onKeyDown={handleKeyDown}
        autoFocus
      />
    </div>
  );
}
