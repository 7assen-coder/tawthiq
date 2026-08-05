import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useSessionStore } from "@/stores/sessionStore";
import * as api from "@/services/tauriAdapter";
import { CAS_CONFIGS } from "@/types";
import type { SessionWithSummary } from "@/types";
import { formatMoney, formatMonth } from "@/lib/utils";
import { SoftActionButton, softControlBase, softToggleActive, softToggleIdle } from "@/components/SoftActionButton";
import { useCountUp } from "@/hooks/useCountUp";
import { useT } from "@/i18n/useT";

type TrendMetric = "montants" | "dossiers" | "conformite";

function getConformity(s: SessionWithSummary): number {
  const cc = s.cas_counts;
  const total = cc.cas1 + cc.cas2 + cc.cas3 + cc.cas4 + cc.cas5 + cc.cas6 + cc.cas7 + (cc.cas8 ?? 0);
  return total > 0
    ? Math.round(((cc.cas1 + cc.cas2 + cc.cas7) / total) * 100)
    : Math.round(s.conformity_rate);
}

function getTotalDossiers(s: SessionWithSummary): number {
  const cc = s.cas_counts;
  return cc.cas1 + cc.cas2 + cc.cas3 + cc.cas4 + cc.cas5 + cc.cas6 + cc.cas7 + (cc.cas8 ?? 0);
}

function ConformityRing({ percentage }: { percentage: number }) {
  const display = useCountUp(percentage, 1200);
  const size = 128;
  const r = 48;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const filled = (percentage / 100) * circ;

  return (
    <div className="relative flex items-center justify-center shrink-0">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--border)" strokeWidth="9" />
        <motion.circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke="var(--green)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ}
          animate={{ strokeDashoffset: circ - filled }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          transform={`rotate(-90 ${cx} ${cx})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[28px] font-[800] text-[var(--text-primary)] tabular-nums num-ltr leading-none">
          {display}%
        </span>
      </div>
    </div>
  );
}

export function HistoriqueScreen() {
  const { currentSession, language } = useSessionStore();
  const [sessions, setSessions] = useState<SessionWithSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("montants");
  const t = useT();

  const loadSessions = useCallback(async () => {
    const all = await api.getAllSessions();
    setSessions(all);
    if (all.length > 0 && selectedId === null) {
      setSelectedId(all[0].session.id);
    }
  }, [selectedId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const selected = sessions.find((s) => s.session.id === selectedId);
  const isCurrent = selected?.session.id === currentSession?.id;
  const recentSessions = sessions.slice(0, 6);
  const conformity = selected ? getConformity(selected) : 0;
  const totalDossiers = selected ? getTotalDossiers(selected) : 0;

  if (sessions.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
        <div className="flex flex-col items-center gap-1.5 mb-2">
          <div className="w-16 h-1.5 bg-[var(--teal)] rounded-full" />
          <div className="w-10 h-1.5 bg-[var(--teal)]/40 rounded-full" />
          <div className="w-6 h-1.5 bg-[var(--teal)]/20 rounded-full" />
        </div>
        <p className="text-[16px] font-bold text-[var(--text-primary)]">{t("hist.noHistory")}</p>
        <p className="text-[14px] text-[var(--text-faint)] max-w-sm">{t("hist.noHistorySub")}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-5 min-h-0">
      {/* Month rail */}
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5 shrink-0">
        {sessions.map((s) => {
          const active = s.session.id === selectedId;
          const sessionCurrent = s.session.id === currentSession?.id;
          const conf = getConformity(s);
          return (
            <button
              key={s.session.id}
              onClick={() => setSelectedId(s.session.id)}
              className={`shrink-0 text-start rounded-xl px-4 py-3 border transition-all min-w-[148px] ${
                active
                  ? "bg-[var(--teal-light)] text-[var(--teal)] border-[var(--teal)]/30"
                  : "bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-app)]"
              }`}
            >
              <p className="text-[14px] font-bold leading-tight">{formatMonth(s.session.month, language)}</p>
              <p className={`text-[12px] mt-1 num-ltr ${active ? "text-[var(--teal)]/75" : "text-[var(--text-faint)]"}`}>
                {conf}% · {sessionCurrent ? t("topbar.enCours") : t("topbar.archive")}
              </p>
            </button>
          );
        })}
      </div>

      {selected ? (
        <div className="flex-1 flex flex-col gap-5 min-h-0 overflow-y-auto">
          {/* Month dossier */}
          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-sm px-6 py-5 shrink-0">
            <div className="flex items-center justify-between gap-4 flex-wrap mb-5">
              <div className="flex items-center gap-3">
                <h2 className="text-[20px] font-bold text-[var(--text-primary)]">
                  {formatMonth(selected.session.month, language)}
                </h2>
                {isCurrent && (
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--green)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-pulse" />
                    {t("topbar.enCours")}
                  </span>
                )}
              </div>
              <SoftActionButton
                onClick={() => useSessionStore.getState().setActiveTab("rapport")}
                label={t("hist.viewReport")}
                variant="primary"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 items-center">
              <div className="flex flex-col items-center gap-2 px-2">
                <ConformityRing percentage={conformity} />
                <p className="text-[13px] font-semibold text-[var(--text-secondary)]">
                  {t("hist.conformite")}
                </p>
                <p className="text-[12px] text-[var(--text-faint)] num-ltr">
                  {totalDossiers} {t("hist.dossiers").toLowerCase()}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  className="rounded-xl px-5 py-4 border border-[var(--border)]"
                  style={{ backgroundColor: "var(--red-bg)", borderLeftWidth: 4, borderLeftColor: "var(--red)" }}
                >
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--red)]">
                    {t("hist.manque")}
                  </p>
                  <p className="text-[26px] font-[800] text-[var(--text-primary)] tabular-nums num-ltr mt-2 leading-none">
                    {formatMoney(selected.total_manque)}
                  </p>
                </div>
                <div
                  className="rounded-xl px-5 py-4 border border-[var(--border)]"
                  style={{ backgroundColor: "var(--indigo-bg)", borderLeftWidth: 4, borderLeftColor: "var(--indigo)" }}
                >
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--indigo)]">
                    {t("hist.surplus")}
                  </p>
                  <p className="text-[26px] font-[800] text-[var(--text-primary)] tabular-nums num-ltr mt-2 leading-none">
                    {formatMoney(selected.total_surplus)}
                  </p>
                </div>

                {/* Case mix fills the empty feel */}
                <div className="sm:col-span-2 grid grid-cols-4 sm:grid-cols-7 gap-2 mt-1">
                  {CAS_CONFIGS.map((cfg) => {
                    const count = selected.cas_counts[cfg.type] ?? 0;
                    return (
                      <div
                        key={cfg.type}
                        className="rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-2 py-2.5 text-center"
                      >
                        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-faint)]">
                          {cfg.type.replace("cas", "C")}
                        </p>
                        <p
                          className="text-[16px] font-bold tabular-nums num-ltr mt-0.5"
                          style={{ color: count > 0 ? cfg.color : "var(--text-faint)" }}
                        >
                          {count}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Trend — fills remaining height */}
          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-sm px-6 py-5 flex-1 min-h-[220px] flex flex-col">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap shrink-0">
              <p className="text-[15px] font-semibold text-[var(--text-primary)]">
                {t("hist.trend")} <span className="num-ltr">{recentSessions.length}</span> {t("hist.mois")}
              </p>
              <div className="flex gap-2">
                {(["montants", "dossiers", "conformite"] as TrendMetric[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setTrendMetric(m)}
                    className={`${softControlBase} h-9 px-3.5 text-[13px] ${
                      trendMetric === m ? softToggleActive : softToggleIdle
                    }`}
                  >
                    {m === "montants"
                      ? t("hist.montants")
                      : m === "dossiers"
                        ? t("hist.dossiers")
                        : t("hist.conformiteTab")}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col justify-center">
              <TrendChart sessions={recentSessions} metric={trendMetric} />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-[var(--text-faint)] text-[15px]">
          {t("hist.selectMonth")}
        </div>
      )}
    </div>
  );
}

function TrendChart({ sessions, metric }: { sessions: SessionWithSummary[]; metric: TrendMetric }) {
  const reversed = [...sessions].reverse();
  const t = useT();
  const language = useSessionStore((s) => s.language);

  const maxValue = Math.max(
    1,
    ...reversed.map((s) => {
      const cc = s.cas_counts;
      if (metric === "montants") return Math.max(s.total_manque, s.total_surplus);
      if (metric === "dossiers") {
        return cc.cas1 + cc.cas2 + cc.cas3 + cc.cas4 + cc.cas5 + cc.cas6 + cc.cas7 + (cc.cas8 ?? 0);
      }
      return 100;
    }),
  );

  return (
    <div className="flex flex-col gap-5 h-full justify-center">
      {reversed.map((s) => {
        const cc = s.cas_counts;
        const totalDossiers = cc.cas1 + cc.cas2 + cc.cas3 + cc.cas4 + cc.cas5 + cc.cas6 + cc.cas7 + (cc.cas8 ?? 0);
        const conformity =
          totalDossiers > 0 ? Math.round(((cc.cas1 + cc.cas2 + cc.cas7) / totalDossiers) * 100) : 0;

        let bar1 = 0;
        let bar2 = 0;
        let label1 = "";
        let label2 = "";
        if (metric === "montants") {
          bar1 = (s.total_manque / maxValue) * 100;
          bar2 = (s.total_surplus / maxValue) * 100;
          label1 = formatMoney(s.total_manque);
          label2 = formatMoney(s.total_surplus);
        } else if (metric === "dossiers") {
          const conformes = cc.cas1 + cc.cas2 + cc.cas7;
          const nonConformes = totalDossiers - conformes;
          bar1 = (nonConformes / maxValue) * 100;
          bar2 = (conformes / maxValue) * 100;
          label1 = `${nonConformes} ${t("hist.ecarts")}`;
          label2 = `${conformes} ${t("hist.conformes")}`;
        } else {
          bar1 = 100 - conformity;
          bar2 = conformity;
          label1 = `${100 - conformity}% ${t("hist.ecarts")}`;
          label2 = `${conformity}% ${t("hist.conforme")}`;
        }

        const monthLabel = formatMonth(s.session.month, language);

        return (
          <div key={s.session.id} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">{monthLabel}</span>
              <div className="flex items-center gap-3 text-[12px] text-[var(--text-faint)]">
                <span className="num-ltr">{label1}</span>
                <span className="text-[var(--border)]">·</span>
                <span className="num-ltr">{label2}</span>
              </div>
            </div>
            <div className="flex gap-1.5 h-10">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(bar1, bar1 > 0 ? 2 : 0)}%` }}
                transition={{ duration: 0.55, ease: "easeOut" }}
                className="rounded-md bg-[var(--red)]/75 h-full min-w-0"
                title={label1}
              />
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(bar2, bar2 > 0 ? 2 : 0)}%` }}
                transition={{ duration: 0.55, ease: "easeOut", delay: 0.08 }}
                className={`rounded-md h-full min-w-0 ${
                  metric === "montants" ? "bg-[var(--indigo)]/75" : "bg-[var(--green)]/75"
                }`}
                title={label2}
              />
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-5 pt-1 justify-start">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-[var(--red)]/80" />
          <span className="text-[12px] text-[var(--text-faint)]">
            {metric === "montants" ? t("hist.manque") : t("hist.ecarts")}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2.5 h-2.5 rounded-sm ${
              metric === "montants" ? "bg-[var(--indigo)]/80" : "bg-[var(--green)]/80"
            }`}
          />
          <span className="text-[12px] text-[var(--text-faint)]">
            {metric === "montants" ? t("hist.surplus") : t("hist.conformes")}
          </span>
        </div>
      </div>
    </div>
  );
}
