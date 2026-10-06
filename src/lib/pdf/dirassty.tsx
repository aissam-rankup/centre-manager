import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { Image, Text, View } from "@react-pdf/renderer";

import { LABELS } from "@/lib/constants/labels";

type PdfImage = { data: Buffer; format: "png" };

let mark: PdfImage | null | undefined;

/** Symbole dirassty monochrome (PNG : le moteur PDF ne lit pas le SVG). Absent du disque : aucun logo. */
function dirasstyMark(): PdfImage | null {
  if (mark === undefined) {
    try {
      mark = { data: readFileSync(path.join(process.cwd(), "public", "brand", "symbole-dirassty-noir.png")), format: "png" };
    } catch {
      mark = null;
    }
  }
  return mark;
}

/**
 * Logo d'en-tête : celui du centre (PNG ou JPEG), sinon le symbole dirassty monochrome.
 * Jamais dirassty en marque blanche.
 */
export function pdfHeaderLogo(logoUrl: string | null, whiteLabel: boolean): string | PdfImage | null {
  const own = logoUrl && /\.(png|jpe?g)(\?|$)/i.test(logoUrl) ? logoUrl : null;
  return own ?? (whiteLabel ? null : dirasstyMark());
}

/** Ligne « Édité avec dirassty », en monochrome ; masquée en marque blanche. */
export function PdfEditedWith({ whiteLabel }: { whiteLabel: boolean }) {
  if (whiteLabel) return null;
  const logo = dirasstyMark();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- composant PDF, pas d'image HTML */}
      {logo ? <Image src={logo} style={{ width: 6, height: 8 }} /> : null}
      <Text>{LABELS.receipts.editedWith}</Text>
    </View>
  );
}
