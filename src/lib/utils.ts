import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(amount: number): string {
  // LRI…PDI keeps space-grouped amounts as one LTR run under dir=rtl
  const formatted = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    useGrouping: true,
  })
    .format(Math.round(amount))
    .replace(/ /g, " ");
  return `\u2066${formatted}\u2069`;
}

const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];
const MONTHS_FR_SHORT = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
const MONTHS_AR_SHORT = ["ينا", "فبر", "مار", "أبر", "ماي", "يون", "يول", "أغس", "سبت", "أكت", "نوف", "ديس"];

export function formatMonth(month: string, lang: "fr" | "ar" = "fr"): string {
  const [year, m] = month.split("-");
  const months = lang === "ar" ? MONTHS_AR : MONTHS_FR;
  return `${months[parseInt(m, 10) - 1]} ${year}`;
}

export function formatMonthShort(month: string, lang: "fr" | "ar" = "fr"): string {
  const [, m] = month.split("-");
  const months = lang === "ar" ? MONTHS_AR_SHORT : MONTHS_FR_SHORT;
  return months[parseInt(m, 10) - 1];
}

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
