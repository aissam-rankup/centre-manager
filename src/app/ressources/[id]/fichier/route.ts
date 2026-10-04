import { getAuthState } from "@/lib/auth/session";
import { RESOURCE_BUCKET } from "@/lib/resources";
import { createClient } from "@/lib/supabase/server";

/**
 * Fichier d'une ressource pédagogique : la ligne est lue avec la session (RLS :
 * auteur, équipe du centre, élève inscrit à la matière si elle est publiée),
 * puis une URL signée de courte durée est créée avec la même session (règles
 * du stockage). Jamais d'URL publique. L'ouverture par un élève est notée
 * (nouveautés). « ?telecharger=1 » propose l'enregistrement du fichier.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response(null, { status: 404 });
  const state = await getAuthState();
  if (state.status !== "authenticated" && state.status !== "student") return new Response(null, { status: 401 });
  if (state.status === "student" && !state.student.allowed) return new Response(null, { status: 403 });

  const supabase = await createClient();
  const { data, error } = await supabase.from("learning_resources").select("file_url, file_name").eq("id", id).maybeSingle();
  if (error || !data?.file_url) return new Response(null, { status: 404 });

  const download = new URL(request.url).searchParams.get("telecharger") === "1";
  const { data: signed, error: signError } = await supabase.storage
    .from(RESOURCE_BUCKET)
    .createSignedUrl(data.file_url, 60, download ? { download: data.file_name ?? true } : undefined);
  if (signError) return new Response(null, { status: 404 });

  if (state.status === "student") await supabase.rpc("mark_resource_opened", { p_resource_id: id });
  return Response.redirect(signed.signedUrl, 302);
}
