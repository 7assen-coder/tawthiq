import { create } from "zustand";
import type { CompareResult, CasType } from "@/types";

interface DataState {
  compareResult: CompareResult | null;
  selectedCas: CasType | null;
  isComparing: boolean;
  compareProgress: number;
  compareStale: boolean;
  setCompareResult: (result: CompareResult | null) => void;
  setSelectedCas: (cas: CasType | null) => void;
  setIsComparing: (val: boolean) => void;
  setCompareProgress: (val: number) => void;
  markCompareStale: () => void;
  clearCompareStale: () => void;
}

export const useDataStore = create<DataState>((set) => ({
  compareResult: null,
  selectedCas: null,
  isComparing: false,
  compareProgress: 0,
  compareStale: false,
  setCompareResult: (result) => set({ compareResult: result, compareStale: false }),
  setSelectedCas: (cas) => set({ selectedCas: cas }),
  setIsComparing: (val) => set({ isComparing: val }),
  setCompareProgress: (val) => set({ compareProgress: val }),
  markCompareStale: () => set((s) => (s.compareResult ? { compareStale: true } : {})),
  clearCompareStale: () => set({ compareStale: false }),
}));
