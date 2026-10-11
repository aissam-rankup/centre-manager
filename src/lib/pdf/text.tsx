import "server-only";

import { Text as PdfText, View } from "@react-pdf/renderer";
import { type ComponentProps, isValidElement, type ReactNode } from "react";

/** Écritures de droite à gauche (hébreu, arabe et ses formes de présentation). */
const ARABIC = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]/;
/** Lettres latines (accentuées comprises), grecques et cyrilliques. */
const LATIN = /[A-Za-z\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff]/;

/**
 * Sens d'un paragraphe d'un document arabe : de gauche à droite pour un texte latin sans arabe (nom, adresse,
 * numéro de reçu), de droite à gauche sinon (phrases, montants, dates, et textes mêlés comme
 * « Pièce retrouvée · يوم … »). Le moteur PDF lit tout de gauche à droite sauf indication contraire : sans
 * cela, une phrase arabe terminée par un mot latin (« صادر عبر dirassty ») s'afficherait dans le désordre.
 */
function directionOf(text: string): "ltr" | "rtl" {
  return LATIN.test(text) && !ARABIC.test(text) ? "ltr" : "rtl";
}

/**
 * Espaces entre chiffres rendues insécables (« 06 12 34 56 78 ») : de droite à gauche, une espace ordinaire
 * sépare les groupes, que l'algorithme bidirectionnel range alors à l'envers (« 78 56 34 12 06 ») ;
 * l'espace insécable lie les groupes en un seul nombre, lu de gauche à droite.
 */
function joinDigitGroups(text: string): string {
  return text.replace(/(\d) (?=\d)/g, `$1${String.fromCharCode(0xa0)}`);
}

/** Texte brut des enfants (chaînes, nombres, textes imbriqués) ; `flat` : uniquement du texte brut. */
function plainText(children: ReactNode): { text: string; flat: boolean } {
  if (typeof children === "string" || typeof children === "number") return { text: String(children), flat: true };
  if (children === null || children === undefined || typeof children === "boolean") return { text: "", flat: true };
  if (Array.isArray(children)) {
    const parts = children.map((child: ReactNode) => plainText(child));
    return { text: parts.map((part) => part.text).join(""), flat: parts.every((part) => part.flat) };
  }
  if (isValidElement<{ children?: ReactNode }>(children)) return { text: plainText(children.props.children).text, flat: false };
  return { text: "", flat: false };
}

type TextProps = {
  rtl?: boolean;
  style?: ComponentProps<typeof View>["style"];
  /** Texte calculé à la mise en page (numéro de page) : de droite à gauche dans un document arabe. */
  render?: (props: { pageNumber: number; totalPages: number }) => ReactNode;
  children?: ReactNode;
};

/**
 * `Text` de @react-pdf, rendu inchangé par défaut. Dans un document de droite à gauche (`rtl`, passé
 * explicitement : les modules PDF font partie du graphe des composants serveur, sans contexte React),
 * le paragraphe suit le sens de lecture de son contenu, et les enfants en texte brut sont réunis en une
 * seule chaîne : le moteur PDF perd sinon la police de repli d'une parenthèse isolée en fin de paragraphe
 * (« (عدد العمليات: 4) » se terminait par un carré).
 */
export function Text({ rtl = false, style, render, children }: TextProps) {
  if (!rtl) return render ? <PdfText style={style} render={render} /> : <PdfText style={style}>{children}</PdfText>;
  const { text, flat } = plainText(children);
  const direction = render ? "rtl" : directionOf(text);
  const styles = [...(Array.isArray(style) ? style : style ? [style] : []), { direction }];
  return render ? <PdfText style={styles} render={render} /> : <PdfText style={styles}>{flat ? joinDigitGroups(text) : children}</PdfText>;
}

const SEPARATOR = " · ";

/**
 * Coordonnées « adresse · téléphone » sur une ligne. De droite à gauche, chaque partie est un texte à part
 * (l'adresse latine reste lue de gauche à droite, le numéro de rue ne passe pas en fin de ligne) ; inchangé
 * de gauche à droite.
 */
export function ContactLine({ rtl = false, style, text }: { rtl?: boolean; style?: TextProps["style"]; text: string }) {
  if (!rtl) return <PdfText style={style}>{text}</PdfText>;
  const parts = text.split(SEPARATOR);
  return (
    <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 3 }}>
      {parts.flatMap((part, index) => [
        index > 0 ? (
          <Text key={`separator-${index}`} rtl style={style}>
            ·
          </Text>
        ) : null,
        <Text key={`part-${index}`} rtl style={style}>
          {part}
        </Text>,
      ])}
    </View>
  );
}
