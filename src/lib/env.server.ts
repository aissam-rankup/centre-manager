import "server-only";

import { z } from "zod";

/** Variables secrètes : serveur uniquement. */
const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  /** Secret partagé avec la tâche quotidienne (Vault « dirassty_cron_secret ») ; absent : route de purge fermée. */
  PLATFORM_CRON_SECRET: z.string().min(32).optional(),
});

export const serverEnv = serverEnvSchema.parse({
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  PLATFORM_CRON_SECRET: process.env.PLATFORM_CRON_SECRET || undefined,
});
