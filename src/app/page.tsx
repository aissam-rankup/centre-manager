import { redirect } from "next/navigation";

// Phase 1 : l'accueil mène à la charte. La redirection par rôle arrive en phase 3.
export default function HomePage() {
  redirect("/charte");
}
