import { useSessionStore } from "@/stores/sessionStore";
import { translations, type TKey } from "./translations";

export function useT() {
  const lang = useSessionStore((s) => s.language);
  return (key: TKey) => translations[lang][key] ?? translations.fr[key];
}
