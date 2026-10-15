import { createCn } from "cn/config";

/**
 * Tailles de texte du thème (globals.css : --text-title, --text-section…).
 * Sans cette déclaration, cn() les prend pour des couleurs : une classe
 * « text-caption » placée avec « text-muted-foreground » était retirée et le
 * texte reprenait la taille de son parent.
 */
export const THEME_FONT_SIZES = ["title", "section", "body", "table", "caption", "stat"] as const;

export const cn = createCn({
  extend: { classGroups: { "font-size": [{ text: [...THEME_FONT_SIZES] }] } },
});
