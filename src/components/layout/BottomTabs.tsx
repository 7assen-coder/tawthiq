import { useSessionStore } from "@/stores/sessionStore";
import { useAuthStore } from "@/stores/authStore";
import type { TabId } from "@/types";
import {
  PencilIcon,
  BarChartIcon,
  CalendarIcon,
  GearIcon,
  ShieldIcon,
} from "@/components/icons";
import { useT } from "@/i18n/useT";
import type { TKey } from "@/i18n/translations";

const baseTabs: { id: TabId; labelKey: TKey; icon: typeof PencilIcon }[] = [
  { id: "saisie", labelKey: "tab.saisie", icon: PencilIcon },
  { id: "rapport", labelKey: "tab.rapport", icon: BarChartIcon },
  { id: "historique", labelKey: "tab.historique", icon: CalendarIcon },
  { id: "reglages", labelKey: "tab.reglages", icon: GearIcon },
];

export function BottomTabs() {
  const { activeTab, setActiveTab } = useSessionStore();
  const isAdminMachine = useAuthStore((s) => s.isAdminMachine);
  const t = useT();

  const tabs = isAdminMachine
    ? [
        ...baseTabs,
        { id: "admin" as const, labelKey: "tab.admin" as TKey, icon: ShieldIcon },
      ]
    : baseTabs;

  return (
    <div className="flex items-stretch bg-[var(--bg-card)] border-t border-[var(--border)] px-4 py-2.5 gap-2">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl transition-all ${
              isActive
                ? "text-[var(--teal)] bg-[var(--teal-light)]"
                : "text-[var(--text-faint)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-app)]"
            }`}
          >
            <Icon size={24} color={isActive ? "var(--teal)" : "var(--text-faint)"} />
            <span className={`text-[14px] ${isActive ? "font-bold" : "font-medium"}`}>
              {t(tab.labelKey)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
