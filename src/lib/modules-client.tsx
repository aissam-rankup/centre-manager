"use client";

import { createContext, type ReactNode, useContext } from "react";

import type { ModuleKey } from "@/lib/modules";

const ModulesContext = createContext<readonly ModuleKey[]>([]);

/** Modules actifs du centre, lus côté serveur (session), pour l'affichage conditionnel. */
export function ModulesProvider({ modules, children }: { modules: readonly ModuleKey[]; children: ReactNode }) {
  return <ModulesContext.Provider value={modules}>{children}</ModulesContext.Provider>;
}

/**
 * Modules actifs du centre et test d'un module. Confort visuel uniquement :
 * l'accès réel est vérifié côté serveur (middleware, gardes, RLS, API).
 */
export function useModules(): { modules: readonly ModuleKey[]; has: (key: ModuleKey) => boolean } {
  const modules = useContext(ModulesContext);
  return { modules, has: (key) => modules.includes(key) };
}
