import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { LogoMark } from "@/components/Logo";
import { useAuthStore } from "@/stores/authStore";
import * as api from "@/services/tauriAdapter";
import { useT } from "@/i18n/useT";
import { useSessionStore } from "@/stores/sessionStore";

export function PinScreen() {
  const { hasExistingPin, setAuthenticated } = useAuthStore();
  const [digits, setDigits] = useState<string[]>(["", "", "", ""]);
  const [error, setError] = useState("");
  const [isSetup] = useState(!hasExistingPin);
  const [confirmPin, setConfirmPin] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useT();
  const lang = useSessionStore((s) => s.language);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const title = isSetup
    ? confirmPin !== null
      ? t("pin.confirm")
      : t("pin.create")
    : t("pin.enter");

  const arabicTitle = isSetup
    ? confirmPin !== null
      ? t("pin.confirmAr")
      : t("pin.createAr")
    : t("pin.enterAr");

  const handleComplete = useCallback(
    async (pin: string) => {
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
          await api.setupPin(pin);
          setAuthenticated(true);
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
    [isSetup, confirmPin, setAuthenticated, t]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
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
        if (pin.length === 4) handleComplete(pin);
        return;
      }

      if (!/^\d$/.test(e.key)) return;

      setDigits((prev) => {
        const next = [...prev];
        const firstEmpty = next.findIndex((d) => d === "");
        if (firstEmpty >= 0) {
          next[firstEmpty] = e.key;
          if (firstEmpty === 3) {
            setTimeout(() => handleComplete(next.join("")), 150);
          }
        }
        return next;
      });
      setError("");
    },
    [digits, handleComplete]
  );

  return (
    <div
      className="h-full w-full flex items-center justify-center"
      style={{
        background: "var(--pin-bg, radial-gradient(ellipse at center, #F0F5F5 0%, #E8EDEE 50%, #DFE5E6 100%))",
      }}
      onClick={() => inputRef.current?.focus()}
    >
      <div className="flex flex-col items-center gap-6">
        <LogoMark size={56} />

        <div className="text-center">
          <h2 className="text-[18px] font-bold text-[var(--text-primary)]">
            {title}
          </h2>
          {lang === "fr" && (
            <p className="text-[13px] text-[var(--text-faint)] mt-1" dir="rtl">
              {arabicTitle}
            </p>
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
              {digit ? "•" : (
                <span className="w-2 h-2 rounded-full bg-[var(--text-faint)]" />
              )}
            </motion.div>
          ))}
        </motion.div>

        {error && (
          <p className="text-[var(--red)] text-[13px] font-medium">{error}</p>
        )}

        <p className="text-[12px] text-[var(--text-faint)] max-w-[260px] text-center">
          {t("pin.hint")}
        </p>
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
