import { NextResponse, type NextRequest } from "next/server";

import { ROUTES } from "@/lib/auth/routes";
import { publicUrlFor } from "@/lib/center-host";
import { createClient } from "@/lib/supabase/server";

/** Jeton renouvelé (changement obligatoire levé, rôle modifié), puis orientation depuis l'accueil. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { error } = await supabase.auth.refreshSession();
  return NextResponse.redirect(publicUrlFor(request.headers, request.nextUrl.origin, error ? ROUTES.login : "/"));
}
