import { z } from "zod";

/**
 * Variables publiques (exposées au navigateur).
 * Les références process.env.X doivent rester explicites pour être inlinées par Next.js.
 */
const publicEnvSchema = z.object({
  // Facultative : sans elle, les Server Actions sont vérifiées contre l'hôte de la requête.
  NEXT_PUBLIC_APP_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export const publicEnv = publicEnvSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});
