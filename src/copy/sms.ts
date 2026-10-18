/**
 * Reminder texts (docs/decisions.md 2026-10-18). Each must fit one 160-character GSM-7
 * segment with the app link: no amounts, no names, no curly quotes or emoji.
 */
const STOP = "Reply STOP to opt out.";
const PREFIX = "IFC Budget:";
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const smsCopy = {
  deadline: (days: number, url: string) =>
    `${PREFIX} your department's annual budget is due in ${plural(days, "day", "days")}. ${url} ${STOP}`,
  approval: (count: number, url: string) =>
    `${PREFIX} ${plural(count, "expense is", "expenses are")} waiting for your approval. ${url} ${STOP}`,
  payment: (count: number, url: string) =>
    `${PREFIX} ${plural(count, "approved expense is", "approved expenses are")} waiting to be paid. ${url} ${STOP}`,
  unclaimed: (reference: string, url: string) =>
    `${PREFIX} approved purchase ${reference} hasn't been bought or claimed yet. ${url} ${STOP}`,
};
