import { useEffect, useMemo, useState } from "react";
import { SoftActionButton } from "@/components/SoftActionButton";
import { ShieldIcon, KeyIcon, GearIcon } from "@/components/icons";
import * as api from "@/services/tauriAdapter";
import type { AccessStatus, ContactInfo, InstallRecord, ResetEntry } from "@/services/tauriAdapter";
import { useT } from "@/i18n/useT";
import type { TKey } from "@/i18n/translations";
import { useAuthStore } from "@/stores/authStore";

type Platform = "windows" | "macos" | "linux" | "unknown";
type AdminCategory = "machines" | "reset" | "settings";

const DRAFT_KEY = "tawthiq_admin_machines_draft_v1";

function loadDraftInstalls(): InstallRecord[] {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as InstallRecord[];
    return Array.isArray(parsed) ? parsed.filter((x) => x?.id) : [];
  } catch {
    return [];
  }
}

function saveDraftInstalls(list: InstallRecord[]) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

const categories: {
  id: AdminCategory;
  labelKey: TKey;
  Icon: typeof ShieldIcon;
}[] = [
  { id: "machines", labelKey: "admin.navMachines", Icon: ShieldIcon },
  { id: "reset", labelKey: "admin.navReset", Icon: KeyIcon },
  { id: "settings", labelKey: "admin.navSettings", Icon: GearIcon },
];

export function AdminScreen() {
  const t = useT();
  const setAccessFromStatus = useAuthStore((s) => s.setAccessFromStatus);
  const [category, setCategory] = useState<AdminCategory>("machines");
  const [unlocked, setUnlocked] = useState(false);
  const [hasMaster, setHasMaster] = useState(false);
  const [masterPin, setMasterPin] = useState("");
  const [status, setStatus] = useState<AccessStatus | null>(null);
  const [error, setError] = useState("");
  const [installs, setInstalls] = useState<InstallRecord[]>([]);
  const [revokedSet, setRevokedSet] = useState<Set<string>>(new Set());
  const [adminSet, setAdminSet] = useState<Set<string>>(new Set());
  const [draftResets, setDraftResets] = useState<ResetEntry[]>([]);
  const [graceDays, setGraceDays] = useState(2);
  const [contact, setContact] = useState<ContactInfo>({
    whatsapp: "+22241824343",
    email: "MoHasseenn@gmail.com",
  });
  const [messageFr, setMessageFr] = useState("");
  const [messageAr, setMessageAr] = useState("");
  const [busy, setBusy] = useState(false);
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [issueForId, setIssueForId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState("");
  const [newId, setNewId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newPlatform, setNewPlatform] = useState<Platform>("windows");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const mergeInstallMap = (
    known: Map<string, InstallRecord>,
    list: InstallRecord[]
  ) => {
    for (const item of list) {
      const id = item.id?.trim();
      if (!id) continue;
      const prev = known.get(id);
      known.set(id, {
        id,
        label: item.label || prev?.label || "",
        platform: item.platform || prev?.platform || "unknown",
        notes: item.notes || prev?.notes || "",
        hostname: item.hostname || prev?.hostname || null,
        app_version: item.app_version || prev?.app_version || null,
        last_seen: item.last_seen || prev?.last_seen || null,
      });
    }
  };

  const refresh = async () => {
    const s = await api.checkAccess();
    setAccessFromStatus(s);
    setStatus(s);
    setDraftResets((prev) => {
      const remote = s.resets ?? [];
      const byHash = new Map(remote.map((r) => [r.code_hash, r]));
      for (const r of prev) byHash.set(r.code_hash, r);
      return [...byHash.values()];
    });
    setGraceDays(s.offline_grace_days ?? 2);
    setContact(s.contact);
    setMessageFr(s.message_fr);
    setMessageAr(s.message_ar);
    setRevokedSet(new Set(s.revoked_install_ids ?? []));
    setAdminSet(new Set(s.admin_install_ids ?? []));

    const known = new Map<string, InstallRecord>();
    mergeInstallMap(known, s.installs ?? []);
    for (const id of s.admin_install_ids ?? []) {
      if (!known.has(id)) {
        known.set(id, { id, label: "Admin", platform: "unknown", notes: "" });
      }
    }
    for (const id of s.revoked_install_ids ?? []) {
      if (!known.has(id)) {
        known.set(id, { id, label: "", platform: "unknown", notes: "" });
      }
    }
    for (const r of s.resets ?? []) {
      if (r.install_id && !known.has(r.install_id)) {
        known.set(r.install_id, {
          id: r.install_id,
          label: "",
          platform: "unknown",
          notes: "",
        });
      }
    }
    if (s.install_id && !known.has(s.install_id)) {
      known.set(s.install_id, {
        id: s.install_id,
        label: t("admin.thisMachine"),
        platform: "macos",
        notes: "",
      });
    }
    // Keep locally added machines (e.g. friend's PC) across refresh until access.json is pushed.
    mergeInstallMap(known, loadDraftInstalls());
    const next = [...known.values()];
    setInstalls(next);
    saveDraftInstalls(next);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const upsertInstall = (rec: InstallRecord) => {
    setInstalls((prev) => {
      const i = prev.findIndex((x) => x.id === rec.id);
      let next: InstallRecord[];
      if (i < 0) next = [...prev, rec];
      else {
        next = [...prev];
        next[i] = { ...next[i], ...rec };
      }
      saveDraftInstalls(next);
      return next;
    });
  };

  const toggleBlock = (id: string) => {
    setRevokedSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAdmin = (id: string) => {
    setAdminSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const issueTemp = async (id: string) => {
    const target = id.trim();
    if (!target) {
      setError(t("admin.issueFailed"));
      return;
    }
    setError("");
    setBusy(true);
    setIssueForId(target);
    try {
      const res = await api.generateTempReset(target);
      setIssuedCode(res.code);
      setDraftResets((prev) => [...prev, res.entry]);
      const existing = installs.find((x) => x.id === target);
      upsertInstall({
        id: target,
        label: existing?.label ?? target,
        platform: (existing?.platform as Platform) || "unknown",
        notes: existing?.notes ?? "",
      });
      setCategory("reset");
      setResetTarget(target);
    } catch {
      setError(t("admin.issueFailed"));
    } finally {
      setBusy(false);
    }
  };

  const addMachine = () => {
    const id = newId.trim();
    if (!id) {
      setError(t("admin.issueFailed"));
      return;
    }
    upsertInstall({
      id,
      label: newLabel.trim() || id,
      platform: newPlatform,
      notes: "",
    });
    setNewId("");
    setNewLabel("");
    setNewPlatform("windows");
    setError("");
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
        revokedInstallIds: [...revokedSet],
        adminInstallIds: [...adminSet],
        offlineGraceDays: graceDays,
        contact,
        resets: draftResets,
        installs,
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

  const rows = useMemo(
    () =>
      [...installs].sort((a, b) =>
        (a.label || a.id).localeCompare(b.label || b.id, undefined, { sensitivity: "base" })
      ),
    [installs]
  );

  const platformLabel = (p: string) => {
    if (p === "windows") return t("admin.platform.windows");
    if (p === "macos") return t("admin.platform.macos");
    if (p === "linux") return t("admin.platform.linux");
    return t("admin.platform.unknown");
  };

  if (!unlocked) {
    return (
      <div className="h-full flex items-center justify-center px-4">
        <div className="w-full max-w-lg flex flex-col gap-5">
          <div className="text-center">
            <h1 className="text-[26px] font-bold text-[var(--text-primary)]">{t("admin.title")}</h1>
            <p className="text-[15px] text-[var(--text-secondary)] mt-2">
              {hasMaster ? t("admin.unlockHint") : t("admin.setupHint")}
            </p>
          </div>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            className="h-14 px-4 rounded-xl border-2 border-[var(--border)] bg-transparent text-center text-[24px] tracking-[0.4em] outline-none focus:border-[var(--teal)]"
            value={masterPin}
            onChange={(e) => setMasterPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="••••"
          />
          {error && <p className="text-[var(--red)] text-[14px] text-center">{error}</p>}
          <SoftActionButton
            label={busy ? "…" : hasMaster ? t("admin.unlock") : t("admin.setup")}
            variant="primary"
            onClick={() => void unlock()}
            disabled={masterPin.length !== 4 || busy}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex gap-6 min-h-0">
      <div className="w-[240px] flex flex-col gap-1.5 shrink-0">
        {categories.map((cat) => {
          const isActive = category === cat.id;
          const Icon = cat.Icon;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-start transition-all ${
                isActive
                  ? "bg-[var(--teal-light)] text-[var(--teal)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-card)]"
              }`}
            >
              <Icon size={20} color="currentColor" />
              <span className={`text-[16px] ${isActive ? "font-bold" : "font-semibold"}`}>
                {t(cat.labelKey)}
              </span>
            </button>
          );
        })}
        <div className="mt-auto pt-4">
          <SoftActionButton label={t("admin.lock")} variant="muted" onClick={() => void lockAdmin()} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-w-0 pe-1">
        {error && (
          <p className="text-[var(--red)] text-[14px] mb-4">{error}</p>
        )}
        {category === "machines" && (
          <div className="flex flex-col gap-7 w-full">
            <div>
              <h3 className="text-[26px] font-bold text-[var(--text-primary)] tracking-tight">
                {t("admin.navMachines")}
              </h3>
              <p className="text-[15px] text-[var(--text-secondary)] mt-2 max-w-3xl leading-relaxed">
                {t("admin.machinesHint")}
              </p>
            </div>

            {status?.install_id && (
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <p className="text-[12px] uppercase tracking-[0.08em] text-[var(--text-faint)] font-semibold">
                    {t("admin.thisMachine")}
                  </p>
                  <p className="font-mono text-[15px] break-all text-[var(--text-primary)] mt-1.5">
                    {status.install_id}
                  </p>
                </div>
                <SoftActionButton
                  label={t("support.copyId")}
                  variant="muted"
                  onClick={() => void navigator.clipboard.writeText(status.install_id)}
                />
              </div>
            )}

            <div className="flex flex-col gap-3 max-w-3xl">
              <h4 className="text-[15px] font-bold text-[var(--text-primary)]">{t("admin.addMachine")}</h4>
              <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_auto_auto] gap-3 items-end">
                <input
                  className="h-12 px-4 rounded-xl border border-[var(--border)] bg-transparent font-mono text-[14px] outline-none focus:border-[var(--teal)]"
                  placeholder={t("admin.targetId")}
                  value={newId}
                  onChange={(e) => setNewId(e.target.value.trim())}
                />
                <input
                  className="h-12 px-4 rounded-xl border border-[var(--border)] bg-transparent outline-none focus:border-[var(--teal)] text-[14px]"
                  placeholder={t("admin.colLabel")}
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
                <select
                  className="h-12 px-3 rounded-xl border border-[var(--border)] bg-transparent text-[14px]"
                  value={newPlatform}
                  onChange={(e) => setNewPlatform(e.target.value as Platform)}
                >
                  <option value="windows">{platformLabel("windows")}</option>
                  <option value="macos">{platformLabel("macos")}</option>
                  <option value="linux">{platformLabel("linux")}</option>
                  <option value="unknown">{platformLabel("unknown")}</option>
                </select>
                <SoftActionButton label={t("admin.saveMachine")} variant="primary" onClick={addMachine} />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[14px] min-w-[1100px]">
                <thead>
                  <tr className="border-b-2 border-[var(--border)] text-start">
                    <th className="px-2 py-3 font-semibold text-[var(--text-secondary)]">
                      {t("admin.colLabel")}
                    </th>
                    <th className="px-2 py-3 font-semibold text-[var(--text-secondary)]">
                      {t("admin.colPlatform")}
                    </th>
                    <th className="px-2 py-3 font-semibold text-[var(--text-secondary)]">
                      {t("admin.colHost")}
                    </th>
                    <th className="px-2 py-3 font-semibold text-[var(--text-secondary)] min-w-[280px]">
                      {t("admin.colId")}
                    </th>
                    <th className="px-2 py-3 font-semibold text-[var(--text-secondary)]">
                      {t("admin.colVersion")}
                    </th>
                    <th className="px-2 py-3 font-semibold text-[var(--text-secondary)]">
                      {t("admin.colSeen")}
                    </th>
                    <th className="px-2 py-3 font-semibold text-[var(--text-secondary)]">
                      {t("admin.colRole")}
                    </th>
                    <th className="px-2 py-3 font-semibold text-[var(--text-secondary)]">
                      {t("admin.colStatus")}
                    </th>
                    <th className="px-2 py-3 font-semibold text-[var(--text-secondary)]">
                      {t("admin.colActions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-2 py-10 text-center text-[15px] text-[var(--text-faint)]">
                        {t("admin.emptyMachines")}
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => {
                    const blocked = revokedSet.has(row.id);
                    const isAdmin = adminSet.has(row.id);
                    return (
                      <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-2 py-4 align-top">
                          <input
                            className="w-full min-w-[120px] h-11 px-3 rounded-lg border border-[var(--border)] bg-transparent outline-none focus:border-[var(--teal)] text-[14px]"
                            value={row.label}
                            onChange={(e) => upsertInstall({ ...row, label: e.target.value })}
                            placeholder={t("admin.colLabel")}
                          />
                        </td>
                        <td className="px-2 py-4 align-top">
                          <select
                            className="h-11 px-3 rounded-lg border border-[var(--border)] bg-transparent text-[14px]"
                            value={row.platform || "unknown"}
                            onChange={(e) =>
                              upsertInstall({ ...row, platform: e.target.value as Platform })
                            }
                          >
                            <option value="windows">{platformLabel("windows")}</option>
                            <option value="macos">{platformLabel("macos")}</option>
                            <option value="linux">{platformLabel("linux")}</option>
                            <option value="unknown">{platformLabel("unknown")}</option>
                          </select>
                        </td>
                        <td className="px-2 py-4 align-top text-[13px] text-[var(--text-secondary)]">
                          {row.hostname || "—"}
                        </td>
                        <td className="px-2 py-4 align-top">
                          <button
                            type="button"
                            className="font-mono text-[13px] text-[var(--teal)] font-semibold break-all text-start leading-snug"
                            title={t("support.copyId")}
                            onClick={() => void navigator.clipboard.writeText(row.id)}
                          >
                            {row.id}
                          </button>
                        </td>
                        <td className="px-2 py-4 align-top font-mono text-[13px] text-[var(--text-secondary)]">
                          {row.app_version || "—"}
                        </td>
                        <td className="px-2 py-4 align-top text-[12px] text-[var(--text-faint)] whitespace-nowrap">
                          {row.last_seen
                            ? new Date(row.last_seen).toLocaleString()
                            : "—"}
                        </td>
                        <td className="px-2 py-4 align-top">
                          <button
                            type="button"
                            className={`px-3 py-1.5 rounded-full text-[13px] font-semibold ${
                              isAdmin
                                ? "bg-[var(--teal-light)] text-[var(--teal)]"
                                : "text-[var(--text-faint)]"
                            }`}
                            onClick={() => toggleAdmin(row.id)}
                          >
                            {isAdmin ? t("admin.roleAdmin") : t("admin.roleUser")}
                          </button>
                        </td>
                        <td className="px-2 py-4 align-top">
                          <span
                            className={`px-3 py-1.5 rounded-full text-[13px] font-semibold ${
                              blocked
                                ? "bg-[var(--red-bg)] text-[var(--red)]"
                                : "text-[var(--green)]"
                            }`}
                          >
                            {blocked ? t("admin.statusBlocked") : t("admin.statusActive")}
                          </span>
                        </td>
                        <td className="px-2 py-4 align-top">
                          <div className="flex flex-wrap gap-2">
                            <SoftActionButton
                              label={blocked ? t("admin.unblock") : t("admin.block")}
                              variant="muted"
                              onClick={() => toggleBlock(row.id)}
                            />
                            <SoftActionButton
                              label={busy && issueForId === row.id ? "…" : t("admin.issueTemp")}
                              variant="primary"
                              onClick={() => void issueTemp(row.id)}
                              disabled={busy}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {category === "reset" && (
          <div className="flex flex-col gap-8 w-full max-w-4xl">
            <div>
              <h3 className="text-[26px] font-bold text-[var(--text-primary)] tracking-tight">
                {t("admin.navReset")}
              </h3>
              <p className="text-[15px] text-[var(--text-secondary)] mt-2 leading-relaxed">
                {t("admin.resetHint")}
              </p>
            </div>

            <div className="flex flex-col gap-8">
              <section className="flex flex-col gap-3">
                <p className="text-[13px] uppercase tracking-[0.08em] font-bold text-[var(--teal)]">
                  {t("admin.resetStep1")}
                </p>
                <input
                  className="h-14 px-5 rounded-xl border-2 border-[var(--border)] bg-transparent font-mono text-[15px] outline-none focus:border-[var(--teal)] max-w-2xl"
                  value={resetTarget}
                  onChange={(e) => setResetTarget(e.target.value.trim())}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
                {rows.length > 0 && (
                  <select
                    className="h-12 px-4 rounded-xl border border-[var(--border)] bg-transparent text-[14px] max-w-2xl"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) setResetTarget(e.target.value);
                    }}
                  >
                    <option value="">{t("admin.pickMachine")}</option>
                    {rows.map((r) => (
                      <option key={r.id} value={r.id}>
                        {(r.label || r.id) + " — " + platformLabel(r.platform || "unknown")}
                      </option>
                    ))}
                  </select>
                )}
                {resetTarget && (
                  <p className="font-mono text-[13px] text-[var(--text-faint)] break-all max-w-2xl">
                    {resetTarget}
                  </p>
                )}
              </section>

              <section className="flex flex-col gap-3 max-w-md">
                <p className="text-[13px] uppercase tracking-[0.08em] font-bold text-[var(--teal)]">
                  {t("admin.resetStep2")}
                </p>
                <SoftActionButton
                  label={busy ? "…" : t("admin.generateTemp")}
                  variant="primary"
                  onClick={() => void issueTemp(resetTarget)}
                  disabled={!resetTarget || busy}
                />
              </section>

              <section className="flex flex-col gap-3">
                <p className="text-[13px] uppercase tracking-[0.08em] font-bold text-[var(--teal)]">
                  {t("admin.resetStep3")}
                </p>
                {issuedCode ? (
                  <div className="flex flex-col gap-3 max-w-xl">
                    <p className="text-[28px] font-mono font-bold tracking-wide text-[var(--teal-dark)] break-all">
                      {issuedCode}
                    </p>
                    <p className="text-[14px] text-[var(--text-secondary)]">{t("admin.tempValid")}</p>
                    <div className="self-start">
                      <SoftActionButton
                        label={t("support.copyId")}
                        variant="primary"
                        onClick={() => void navigator.clipboard.writeText(issuedCode)}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-[15px] text-[var(--text-faint)]">{t("admin.tempWaiting")}</p>
                )}
              </section>
            </div>

            <p className="text-[14px] text-[var(--text-faint)]">
              {t("admin.resetsCount").replace("{n}", String(draftResets.length))}
            </p>
          </div>
        )}

        {category === "settings" && (
          <div className="flex flex-col gap-7 w-full max-w-4xl">
            <div>
              <h3 className="text-[26px] font-bold text-[var(--text-primary)] tracking-tight">
                {t("admin.settingsTitle")}
              </h3>
              <p className="text-[15px] text-[var(--text-secondary)] mt-2">{t("admin.settingsHint")}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <label className="flex flex-col gap-2 text-[13px] text-[var(--text-faint)] font-semibold">
                {t("admin.graceDays")}
                <input
                  type="number"
                  min={0}
                  className="h-12 px-4 rounded-xl border border-[var(--border)] bg-transparent text-[var(--text-primary)] text-[15px] outline-none focus:border-[var(--teal)] font-normal"
                  value={graceDays}
                  onChange={(e) => setGraceDays(Number(e.target.value) || 0)}
                />
              </label>
              <label className="flex flex-col gap-2 text-[13px] text-[var(--text-faint)] font-semibold">
                WhatsApp
                <input
                  className="h-12 px-4 rounded-xl border border-[var(--border)] bg-transparent text-[var(--text-primary)] text-[15px] outline-none focus:border-[var(--teal)] font-normal"
                  value={contact.whatsapp}
                  onChange={(e) => setContact({ ...contact, whatsapp: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-2 text-[13px] text-[var(--text-faint)] font-semibold">
                Email
                <input
                  className="h-12 px-4 rounded-xl border border-[var(--border)] bg-transparent text-[var(--text-primary)] text-[15px] outline-none focus:border-[var(--teal)] font-normal"
                  value={contact.email}
                  onChange={(e) => setContact({ ...contact, email: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-2 text-[13px] text-[var(--text-faint)] font-semibold">
                {t("admin.messageFr")}
                <input
                  className="h-12 px-4 rounded-xl border border-[var(--border)] bg-transparent text-[var(--text-primary)] text-[15px] outline-none focus:border-[var(--teal)] font-normal"
                  value={messageFr}
                  onChange={(e) => setMessageFr(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-2 text-[13px] text-[var(--text-faint)] font-semibold md:col-span-2">
                {t("admin.messageAr")}
                <input
                  className="h-12 px-4 rounded-xl border border-[var(--border)] bg-transparent text-[var(--text-primary)] text-[15px] outline-none focus:border-[var(--teal)] font-normal"
                  value={messageAr}
                  onChange={(e) => setMessageAr(e.target.value)}
                  dir="rtl"
                />
              </label>
            </div>

            <div className="flex flex-col gap-2 pt-3 border-t border-[var(--border)] max-w-xl">
              <SoftActionButton
                label={busy ? "…" : t("admin.export")}
                variant="primary"
                onClick={() => void exportPolicy()}
                disabled={busy}
              />
              <p className="text-[13px] text-[var(--text-faint)]">{t("admin.pushHint")}</p>
            </div>

            <button
              type="button"
              className="text-[14px] font-semibold text-[var(--teal)] self-start"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? t("admin.hideAdvanced") : t("admin.showAdvanced")}
            </button>
            {showAdvanced && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex flex-col gap-2 text-[13px] text-[var(--text-faint)] font-semibold">
                  {t("admin.revokedIds")}
                  <textarea
                    className="min-h-[120px] p-4 rounded-xl border border-[var(--border)] bg-transparent font-mono text-[13px] font-normal"
                    value={[...revokedSet].join("\n")}
                    onChange={(e) =>
                      setRevokedSet(
                        new Set(
                          e.target.value
                            .split(/[\n,]+/)
                            .map((s) => s.trim())
                            .filter(Boolean)
                        )
                      )
                    }
                  />
                </label>
                <label className="flex flex-col gap-2 text-[13px] text-[var(--text-faint)] font-semibold">
                  {t("admin.adminIds")}
                  <textarea
                    className="min-h-[120px] p-4 rounded-xl border border-[var(--border)] bg-transparent font-mono text-[13px] font-normal"
                    value={[...adminSet].join("\n")}
                    onChange={(e) =>
                      setAdminSet(
                        new Set(
                          e.target.value
                            .split(/[\n,]+/)
                            .map((s) => s.trim())
                            .filter(Boolean)
                        )
                      )
                    }
                  />
                </label>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
