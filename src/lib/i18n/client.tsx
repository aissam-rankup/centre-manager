"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";

import { type AppLabels, labelsFor } from "@/lib/constants/labels";
import { DEFAULT_VOCABULARY, type VocabularyTerms } from "@/lib/vocabulary";

const LabelsContext = createContext<AppLabels>(labelsFor(DEFAULT_VOCABULARY));

/** Fournit les libellés dans le vocabulaire du centre à tous les Client Components. */
export function LabelsProvider({ terms, children }: { terms: VocabularyTerms; children: ReactNode }) {
  const labels = useMemo(() => labelsFor(terms), [terms]);
  return <LabelsContext.Provider value={labels}>{children}</LabelsContext.Provider>;
}

/** Libellés de l'interface dans le vocabulaire du centre (vocabulaire par défaut hors centre). */
export function useLabels(): AppLabels {
  return useContext(LabelsContext);
}
