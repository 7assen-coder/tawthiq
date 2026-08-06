import { useSessionStore } from "@/stores/sessionStore";
import { softControlBase, softToggleActive, softToggleIdle } from "@/components/SoftActionButton";

export function LanguageToggle({ className = "" }: { className?: string }) {
  const { language, setLanguage } = useSessionStore();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => setLanguage("fr")}
        className={`${softControlBase} min-w-[52px] ${
          language === "fr" ? softToggleActive : softToggleIdle
        }`}
      >
        FR
      </button>
      <button
        type="button"
        onClick={() => setLanguage("ar")}
        className={`${softControlBase} min-w-[52px] ${
          language === "ar" ? softToggleActive : softToggleIdle
        }`}
      >
        AR
      </button>
    </div>
  );
}
