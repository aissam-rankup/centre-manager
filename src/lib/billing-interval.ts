export type BillingIntervalValue = "month" | "year";

/**
 * Date ISO + un mois ou un an, comme Postgres (« date + interval ») :
 * le jour est ramené au dernier jour du mois si besoin (31/01 + 1 mois = 28/02).
 */
export function addBillingInterval(iso: string, interval: BillingIntervalValue): string {
  const [year = 0, month = 1, day = 1] = iso.split("-").map(Number);
  const targetYear = interval === "year" ? year + 1 : year + (month === 12 ? 1 : 0);
  const targetMonth = interval === "year" ? month : month === 12 ? 1 : month + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const date = new Date(Date.UTC(targetYear, targetMonth - 1, Math.min(day, lastDay)));
  return date.toISOString().slice(0, 10);
}
