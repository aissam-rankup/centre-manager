import { describe, expect, it } from "vitest";

import { appTimeZoneAt, formatDate, formatDateTime, MOROCCO_GMT_SINCE, toISODate } from "@/lib/format";

describe("heure du Maroc", () => {
  it("GMT depuis le 20/09/2026 à 01:00 UTC, quelle que soit la base de fuseaux", () => {
    expect(formatDateTime("2026-10-12T22:39:00Z")).toBe("12/10/2026 22:39");
    expect(toISODate("2026-10-12T23:30:00Z")).toBe("2026-10-12");
    expect(formatDateTime("2026-09-20T01:00:00Z")).toBe("20/09/2026 01:00");
  });

  it("UTC+1 avant la bascule (historique inchangé)", () => {
    expect(formatDateTime("2026-06-15T10:00:00Z")).toBe("15/06/2026 11:00");
    expect(formatDateTime("2026-09-20T00:59:00Z")).toBe("20/09/2026 01:59");
  });

  it("dates calendaires inchangées", () => {
    expect(formatDate("2026-10-12")).toBe("12/10/2026");
    expect(formatDate("2026-03-01")).toBe("01/03/2026");
  });

  it("fuseau choisi selon l'instant", () => {
    expect(appTimeZoneAt(MOROCCO_GMT_SINCE)).toBe("+00:00");
    expect(appTimeZoneAt(MOROCCO_GMT_SINCE - 1)).toBe("Africa/Casablanca");
  });
});
