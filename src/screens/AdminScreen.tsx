import { useEffect, useState } from "react";
import { SoftActionButton } from "@/components/SoftActionButton";
import * as api from "@/services/tauriAdapter";
import type { AccessStatus, ContactInfo, ResetEntry } from "@/services/tauriAdapter";
import { useT } from "@/i18n/useT";
import { useAuthStore } from "@/stores/authStore";

export function AdminScreen() {
  const t = useT();
  const setAccessFromStatus = useAuthStore((s) => s.setAccessFromStatus);
  const [unlocked, setUnlocked] = useState(false);
  const [hasMaster, setHasMaster] = useState(false);
  const [masterPin, setMasterPin] = useState("");
  const [status, setStatus] = useState<AccessStatus | null>(null);
  const [error, setError] = useState("");
  const [targetId, setTargetId] = useState("");
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [draftResets, setDraftResets] = useState<ResetEntry[]>([]);
  const [revokedIds, setRevokedIds] = useState("");
  const [adminIds, setAdminIds] = useState("");
  const [graceDays, setGraceDays] = useState(2);
  const [contact, setContact] = useState<ContactInfo>({
    whatsapp: "+22241824343",
    email: "MoHasseenn@gmail.com",
  });
  const [messageFr, setMessageFr] = useState("");
  const [messageAr, setMessageAr] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const s = await api.checkAccess();
    setAccessFromStatus(s);
    setStatus(s);
    setDraftResets(s.resets ?? []);
    setRevokedIds((s.revoked_install_ids ?? []).join("\n"));
    setAdminIds((s.admin_install_ids ?? []).join("\n"));
    setGraceDays(s.offline_grace_days ?? 2);
    setContact(s.contact);
    setMessageFr(s.message_fr);
    setMessageAr(s.message_ar);
  };

  useEffect(() => {
    void (async () => {
      try {
        const active = await api.adminSessionActive();
        setUnlocked(active);
        setHasMaster(await api.hasAdminMasterPin());
        await refresh();
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const unlock = async () => {
    setError("");
    setBusy(true);
    try {
      if (!hasMaster) {
        await api.setupAdminMasterPin(masterPin);
        setHasMaster(true);
      } else {
        await api.verifyAdminMasterPin(masterPin);
      }
      setUnlocked(true);
      setMasterPin("");
      await refresh();
    } catch {
      setError(t("admin.pinWrong"));
    } finally {
      setBusy(false);
    }
  };

  const lockAdmin = async () => {
    await api.adminSessionLock();
    setUnlocked(false);
  };

  const parseLines = (text: string) =>
    text
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  const issueTemp = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await api.generateTempReset(targetId.trim());
      setIssuedCode(res.code);
      setDraftResets((prev) => [...prev, res.entry]);
    } catch {
      setError(t("admin.issueFailed"));
    } finally {
      setBusy(false);
    }
  };

  const exportPolicy = async () => {
    setError("");
    setBusy(true);
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const path = await save({
        defaultPath: "access.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await api.exportAccessPolicyJson({
        revokedAll: false,
        revokedInstallIds: parseLines(revokedIds),
        adminInstallIds: parseLines(adminIds),
        offlineGraceDays: graceDays,
        contact,
        resets: draftResets,
        messageFr,
        messageAr,
        outputPath: path,
      });
    } catch {
      setError(t("admin.exportFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (!unlocked) {
    return (
      <div className="max-w-md mx-auto flex flex-col gap-4 py-6">
        <h1 className="text-[20px] font-bold text-[var(--text-primary)]">{t("admin.title")}</h1>
        <p className="text-[13px] text-[var(--text-faint)]">
          {hasMaster ? t("admin.unlockHint") : t("admin.setupHint")}
        </p>
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          className="h-11 px-3 rounded-lg border border-[var(--border)] bg-white"
          value={masterPin}
          onChange={(e) => setMasterPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="••••"
        />
        {error && <p className="text-[var(--red)] text-[13px]">{error}</p>}
        <SoftActionButton
          label={busy ? "…" : hasMaster ? t("admin.unlock") : t("admin.setup")}
          variant="primary"
          onClick={() => void unlock()}
          disabled={masterPin.length !== 4 || busy}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-5 py-4 pb-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[20px] font-bold">{t("admin.title")}</h1>
        <SoftActionButton label={t("admin.lock")} variant="muted" onClick={() => void lockAdmin()} />
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <p className="text-[12px] text-[var(--text-faint)] mb-1">{t("support.installId")}</p>
        <p className="font-mono text-[13px] break-all">{status?.install_id}</p>
        <div className="mt-2">
          <SoftActionButton
            label={t("support.copyId")}
            variant="muted"
            onClick={() => void navigator.clipboard.writeText(status?.install_id ?? "")}
          />
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 flex flex-col gap-3">
        <h2 className="font-bold text-[15px]">{t("admin.tempTitle")}</h2>
        <input
          className="h-11 px-3 rounded-lg border border-[var(--border)] bg-white font-mono text-[13px]"
          placeholder={t("admin.targetId")}
          value={targetId}
          onChange={(e) => setTargetId(e.target.value.trim())}
        />
        <SoftActionButton
          label={busy ? "…" : t("admin.issueTemp")}
          variant="primary"
          onClick={() => void issueTemp()}
          disabled={!targetId || busy}
        />
        {issuedCode && (
          <p className="text-[18px] font-mono font-bold text-[var(--teal)]">
            {t("admin.tempCode")}: {issuedCode}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 flex flex-col gap-3">
        <h2 className="font-bold text-[15px]">{t("admin.policyTitle")}</h2>
        <label className="text-[12px] text-[var(--text-faint)]">{t("admin.revokedIds")}</label>
        <textarea
          className="min-h-[80px] p-3 rounded-lg border border-[var(--border)] bg-white font-mono text-[12px]"
          value={revokedIds}
          onChange={(e) => setRevokedIds(e.target.value)}
        />
        <label className="text-[12px] text-[var(--text-faint)]">{t("admin.adminIds")}</label>
        <textarea
          className="min-h-[80px] p-3 rounded-lg border border-[var(--border)] bg-white font-mono text-[12px]"
          value={adminIds}
          onChange={(e) => setAdminIds(e.target.value)}
        />
        <label className="text-[12px] text-[var(--text-faint)]">{t("admin.graceDays")}</label>
        <input
          type="number"
          min={0}
          className="h-11 px-3 rounded-lg border border-[var(--border)] bg-white w-32"
          value={graceDays}
          onChange={(e) => setGraceDays(Number(e.target.value) || 0)}
        />
        <label className="text-[12px] text-[var(--text-faint)]">WhatsApp</label>
        <input
          className="h-11 px-3 rounded-lg border border-[var(--border)] bg-white"
          value={contact.whatsapp}
          onChange={(e) => setContact({ ...contact, whatsapp: e.target.value })}
        />
        <label className="text-[12px] text-[var(--text-faint)]">Email</label>
        <input
          className="h-11 px-3 rounded-lg border border-[var(--border)] bg-white"
          value={contact.email}
          onChange={(e) => setContact({ ...contact, email: e.target.value })}
        />
        <label className="text-[12px] text-[var(--text-faint)]">{t("admin.messageFr")}</label>
        <input
          className="h-11 px-3 rounded-lg border border-[var(--border)] bg-white"
          value={messageFr}
          onChange={(e) => setMessageFr(e.target.value)}
        />
        <label className="text-[12px] text-[var(--text-faint)]">{t("admin.messageAr")}</label>
        <input
          className="h-11 px-3 rounded-lg border border-[var(--border)] bg-white"
          value={messageAr}
          onChange={(e) => setMessageAr(e.target.value)}
        />
        <p className="text-[12px] text-[var(--text-faint)]">
          {t("admin.resetsCount").replace("{n}", String(draftResets.length))}
        </p>
        <SoftActionButton
          label={busy ? "…" : t("admin.export")}
          variant="primary"
          onClick={() => void exportPolicy()}
          disabled={busy}
        />
        <p className="text-[12px] text-[var(--text-faint)]">{t("admin.pushHint")}</p>
      </section>

      {error && <p className="text-[var(--red)] text-[13px]">{error}</p>}
    </div>
  );
}
