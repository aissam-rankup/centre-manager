import { getAuthState } from "@/lib/auth/session";
import { RESOURCE_BUCKET } from "@/lib/resources";
import { createClient } from "@/lib/supabase/server";

/**
 * Fichier d'une ressource pédagogique : la ligne est lue avec la session (RLS :
 * auteur, équipe du centre, élève concerné), puis une URL signée de courte
 * durée est créée avec la même session (règles du stockage). Jamais d'URL
 * publique.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response(null, { status: 404 });
  const state = await getAuthState();
  if (state.status !== "authenticated" && state.status !== "student") return new Response(null, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase.from("learning_resources").select("file_url").eq("id", id).maybeSingle();
  if (error || !data?.file_url) return new Response(null, { status: 404 });

  const { data: signed, error: signError } = await supabase.storage.from(RESOURCE_BUCKET).createSignedUrl(data.file_url, 60);
  if (signError) return new Response(null, { status: 404 });
  return Response.redirect(signed.signedUrl, 302);
}
