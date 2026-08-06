import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { motion } from "framer-motion";
import { LogoMark } from "@/components/Logo";
import { SoftActionButton } from "@/components/SoftActionButton";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useAuthStore } from "@/stores/authStore";
import * as api from "@/services/tauriAdapter";
import type { ContactInfo } from "@/services/tauriAdapter";
import { useT } from "@/i18n/useT";
import { useSessionStore } from "@/stores/sessionStore";

type Mode = "pin" | "recoveryShown" | "forgotContact" | "forgotCode" | "forceNewPin";
type CodeKind = "temp" | "recovery";
type ForgotStep = 1 | 2 | 3;

function waUrl(phone: string, text: string) {
  const digits = phone.replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function ForgotStepRail({ step, labels }: { step: ForgotStep; labels: [string, string, string] }) {
  return (
    <div className="w-full max-w-3xl flex items-center gap-3">
      {labels.map((label, i) => {
        const n = (i + 1) as ForgotStep;
        const done = n < step;
        const active = n === step;
        return (
          <div key={label} className="flex-1 flex flex-col items-center gap-2 min-w-0">
            <div className="w-full flex items-center gap-2">
              {i > 0 && (
                <div
                  className={`h-[3px] flex-1 rounded-full ${done || active ? "bg-[var(--teal)]" : "bg-[var(--border)]"}`}
                />
              )}
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center text-[15px] font-bold shrink-0 ${
                  active
                    ? "bg-[var(--teal)] text-white shadow-sm"
                    : done
                      ? "bg-[var(--teal-light)] text-[var(--teal)]"
                      : "bg-transparent text-[var(--text-faint)] border-2 border-[var(--border)]"
                }`}
              >
                {n}
              </div>
              {i < labels.length - 1 && (
                <div
                  className={`h-[3px] flex-1 rounded-full ${done ? "bg-[var(--teal)]" : "bg-[var(--border)]"}`}
                />
              )}
            </div>
            <p
              className={`text-[14px] font-semibold truncate w-full text-center ${
                active ? "text-[var(--text-primary)]" : "text-[var(--text-faint)]"
              }`}
            >
              {label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

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
  const [codeKind, setCodeKind] = useState<CodeKind>("temp");
  const [installId, setInstallId] = useState("");
  const [support, setSupport] = useState<ContactInfo>(contact);
  const [pendingNewPin, setPendingNewPin] = useState<string | null>(null);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useT();
  const lang = useSessionStore((s) => s.language);

  useEffect(() => {
    if (mode === "pin" || mode === "forceNewPin") {
      inputRef.current?.focus();
    }
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
      ? pendingNewPin === null
        ? t("pin.create")
        : t("pin.confirm")
      : t("pin.enter");

  const arabicTitle = isSetup
    ? confirmPin !== null
      ? t("pin.confirmAr")
      : t("pin.createAr")
    : t("pin.enterAr");

  const railLabels: [string, string, string] = [
    t("pin.railContact"),
    t("pin.railCode"),
    t("pin.railPin"),
  ];

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
          if (codeKind === "recovery") {
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
            setWrongAttempts(0);
            setAuthenticated(true);
          } else {
            setWrongAttempts((n) => n + 1);
            if (result.error === "LOCKED" && result.retry_after_secs) {
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
          }
        } catch {
          setError(t("pin.unavailable"));
        }
      }
    },
    [
      mode,
      pendingNewPin,
      codeKind,
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
      if (mode === "forgotContact" || mode === "forgotCode" || mode === "recoveryShown") return;
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

  const cancelForgot = () => {
    setMode("pin");
    setError("");
    setTempCode("");
    setRecoveryCode("");
    setCodeKind("temp");
  };

  const phone = support.whatsapp || "+22241824343";
  const email = support.email || "MoHasseenn@gmail.com";
  const contactTemplate = `Tawthiq — Install ID: ${installId} — reason: pin_help`;

  const pinBg =
    "var(--pin-bg, radial-gradient(ellipse at center, #F0F5F5 0%, #E8EDEE 50%, #DFE5E6 100%))";

  const shell = (children: ReactNode) => (
    <div
      className="h-full w-full flex flex-col items-center justify-center px-8 py-10 relative overflow-y-auto"
      style={{ background: pinBg }}
    >
      <div className="absolute top-6 end-6 z-10">
        <LanguageToggle />
      </div>
      {children}
    </div>
  );

  if (mode === "recoveryShown" && shownRecovery) {
    return shell(
      <div className="w-full max-w-3xl flex flex-col items-center gap-7 text-center">
        <LogoMark size={72} />
        <h2 className="text-[28px] font-bold tracking-tight">{t("pin.recoveryTitle")}</h2>
        <p className="text-[16px] text-[var(--text-faint)] max-w-xl leading-relaxed">
          {t("pin.recoveryHint")}
        </p>
        <p className="text-[32px] font-mono font-bold tracking-wider text-[var(--teal)]">
          {shownRecovery}
        </p>
        <div className="flex gap-3">
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

  if (mode === "forgotContact") {
    return shell(
      <div className="w-full max-w-3xl flex flex-col items-center gap-8">
        <ForgotStepRail step={1} labels={railLabels} />

        <div className="flex flex-col items-center gap-3 text-center">
          <LogoMark size={64} />
          <h2 className="text-[28px] font-bold tracking-tight text-[var(--text-primary)]">
            {t("pin.forgotTitle")}
          </h2>
          <p className="text-[16px] text-[var(--text-secondary)] leading-relaxed max-w-xl">
            {t("pin.forgotStep1Message")}
          </p>
        </div>

        <div className="w-full flex flex-col gap-3">
          <p className="text-[13px] uppercase tracking-[0.08em] text-[var(--text-faint)] font-semibold text-center">
            {t("support.installId")}
          </p>
          <div className="flex items-center gap-3 justify-center flex-wrap">
            <p className="text-[17px] font-mono break-all text-[var(--text-primary)] leading-relaxed text-center">
              {installId || "…"}
            </p>
            <SoftActionButton
              onClick={() => void navigator.clipboard.writeText(installId)}
              label={t("support.copyId")}
              variant="muted"
            />
          </div>
        </div>

        <div className="w-full max-w-xl grid grid-cols-2 gap-4">
          <SoftActionButton
            label={t("support.whatsapp")}
            variant="primary"
            onClick={() => window.open(waUrl(phone, contactTemplate), "_blank")}
          />
          <SoftActionButton
            label={t("support.email")}
            variant="muted"
            onClick={() => {
              window.location.href = `mailto:${email}?subject=${encodeURIComponent("Tawthiq support")}&body=${encodeURIComponent(contactTemplate)}`;
            }}
          />
        </div>
        <p className="text-[14px] text-[var(--text-faint)] text-center">
          {phone} · {email}
        </p>

        <div className="flex gap-4 justify-center pt-2">
          <SoftActionButton
            label={t("pin.stepContinue")}
            variant="primary"
            onClick={() => {
              setCodeKind("temp");
              setMode("forgotCode");
              setError("");
            }}
          />
          <SoftActionButton label={t("settings.pinCancel")} variant="muted" onClick={cancelForgot} />
        </div>
      </div>
    );
  }

  if (mode === "forgotCode") {
    return shell(
      <div className="w-full max-w-3xl flex flex-col items-center gap-8">
        <ForgotStepRail step={2} labels={railLabels} />
        <div className="flex flex-col items-center gap-3 text-center">
          <LogoMark size={64} />
          <h2 className="text-[28px] font-bold tracking-tight text-[var(--text-primary)]">
            {codeKind === "temp" ? t("pin.tempTitle") : t("pin.recoveryInputTitle")}
          </h2>
          <p className="text-[16px] text-[var(--text-secondary)] leading-relaxed max-w-xl">
            {codeKind === "temp" ? t("pin.tempHint") : t("pin.recoveryInputHint")}
          </p>
        </div>

        {codeKind === "temp" ? (
          <input
            className="w-full max-w-xl h-16 px-6 rounded-2xl border-2 border-[var(--border)] bg-transparent font-mono text-[20px] tracking-wide outline-none focus:border-[var(--teal)] text-center"
            placeholder="ckavubuiv2423jj"
            value={tempCode}
            onChange={(e) => setTempCode(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
            autoFocus
          />
        ) : (
          <input
            className="w-full max-w-xl h-16 px-6 rounded-2xl border-2 border-[var(--border)] bg-transparent font-mono text-[20px] outline-none focus:border-[var(--teal)] text-center"
            placeholder="TW-XXXX-XXXX"
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
            autoFocus
          />
        )}

        {error && <p className="text-center text-[var(--red)] text-[15px]">{error}</p>}

        <div className="flex gap-4 justify-center">
          <SoftActionButton
            label={t("pin.stepContinue")}
            variant="primary"
            onClick={() => {
              if (codeKind === "temp" && tempCode.trim().length < 8) {
                setError(t("pin.wrong"));
                return;
              }
              if (codeKind === "recovery" && recoveryCode.trim().length < 8) {
                setError(t("pin.wrong"));
                return;
              }
              startForceNewPin();
            }}
          />
          <SoftActionButton
            label={t("pin.stepBack")}
            variant="muted"
            onClick={() => {
              setMode("forgotContact");
              setError("");
            }}
          />
        </div>

        {codeKind === "temp" ? (
          <button
            type="button"
            className="text-[15px] font-semibold text-[var(--teal)] text-center"
            onClick={() => {
              setCodeKind("recovery");
              setError("");
            }}
          >
            {t("pin.haveRecovery")}
          </button>
        ) : (
          <button
            type="button"
            className="text-[15px] font-semibold text-[var(--teal)] text-center"
            onClick={() => {
              setCodeKind("temp");
              setError("");
            }}
          >
            {t("pin.haveTemp")}
          </button>
        )}
      </div>
    );
  }

  if (mode === "forceNewPin") {
    return shell(
      <div
        className="w-full max-w-3xl flex flex-col items-center gap-8"
        onClick={() => inputRef.current?.focus()}
      >
        <ForgotStepRail step={3} labels={railLabels} />
        <LogoMark size={64} />
        <div className="text-center">
          <h2 className="text-[28px] font-bold tracking-tight text-[var(--text-primary)]">{title}</h2>
          <p className="text-[16px] text-[var(--text-faint)] mt-2">{t("pin.forceNewHint")}</p>
        </div>

        <motion.div
          className="flex gap-4"
          animate={shake ? { x: [0, -12, 12, -12, 12, -6, 6, 0] } : {}}
          transition={{ duration: 0.3 }}
        >
          {digits.map((digit, i) => (
            <motion.div
              key={i}
              className={`w-[72px] h-[80px] rounded-2xl border-2 flex items-center justify-center text-[28px] font-[800] transition-colors ${
                digit
                  ? "border-[var(--teal)] bg-[var(--bg-card)] text-[var(--text-primary)]"
                  : "border-[var(--border)] bg-[var(--bg-card)]/70"
              }`}
              animate={digit ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 0.15 }}
            >
              {digit ? "•" : <span className="w-2.5 h-2.5 rounded-full bg-[var(--text-faint)]" />}
            </motion.div>
          ))}
        </motion.div>

        {error && <p className="text-[var(--red)] text-[15px] font-medium">{error}</p>}
        <p className="text-[14px] text-[var(--text-faint)] text-center">{t("pin.hint")}</p>
        <SoftActionButton
          label={t("pin.stepBack")}
          variant="muted"
          onClick={() => {
            setMode("forgotCode");
            setPendingNewPin(null);
            setDigits(["", "", "", ""]);
            setError("");
          }}
        />
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

  return (
    <div
      className="h-full w-full flex items-center justify-center relative"
      style={{ background: pinBg }}
      onClick={() => inputRef.current?.focus()}
    >
      <div className="absolute top-6 end-6">
        <LanguageToggle />
      </div>

      <div className="flex flex-col items-center gap-6">
        <LogoMark size={56} />

        <div className="text-center">
          <h2 className="text-[18px] font-bold text-[var(--text-primary)]">{title}</h2>
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
              {digit ? "•" : <span className="w-2 h-2 rounded-full bg-[var(--text-faint)]" />}
            </motion.div>
          ))}
        </motion.div>

        {error && <p className="text-[var(--red)] text-[13px] font-medium">{error}</p>}

        <p className="text-[12px] text-[var(--text-faint)] max-w-[260px] text-center">
          {t("pin.hint")}
        </p>

        {!isSetup && wrongAttempts >= 3 && (
          <button
            type="button"
            className="text-[13px] font-semibold text-[var(--teal)]"
            onClick={() => {
              setMode("forgotContact");
              setError("");
            }}
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
