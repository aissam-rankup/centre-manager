"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";

import { type AppLabels, labelsFor, messageTranslator } from "@/lib/constants/labels";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";
import { DEFAULT_VOCABULARY, type VocabularyTerms } from "@/lib/vocabulary";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);
const LabelsContext = createContext<AppLabels>(labelsFor(DEFAULT_VOCABULARY));
const MessageContext = createContext<(text: string) => string>((text) => text);

/** Langue de l'interface choisie par l'utilisateur (posée par le layout racine). */
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** Langue de l'interface (Client Components). */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** Fournit les libellés, dans la langue de l'utilisateur et le vocabulaire du centre, à tous les Client Components. */
export function LabelsProvider({
  terms,
  brandName = null,
  children,
}: {
  terms: VocabularyTerms;
  /** Marque blanche : nom affiché à la place de celui de la plateforme. */
  brandName?: string | null;
  children: ReactNode;
}) {
  const locale = useLocale();
  const labels = useMemo(() => labelsFor(terms, brandName, locale), [terms, brandName, locale]);
  const message = useMemo(() => messageTranslator(terms, brandName, locale), [terms, brandName, locale]);
  return (
    <LabelsContext.Provider value={labels}>
      <MessageContext.Provider value={message}>{children}</MessageContext.Provider>
    </LabelsContext.Provider>
  );
}

/** Libellés de l'interface dans la langue de l'utilisateur et le vocabulaire du centre (vocabulaire par défaut hors centre). */
export function useLabels(): AppLabels {
  return useContext(LabelsContext);
}

/**
 * Traduit un message reçu du serveur (erreur d'action, de validation) dans la
 * langue de l'utilisateur : `toast.error(message(result.error))`.
 */
export function useMessage(): (text: string) => string {
  return useContext(MessageContext);
}
