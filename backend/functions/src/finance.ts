import { z } from "zod";
import { categories, summarize, round } from "./domain";
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
    "Fecha inválida",
  );
const identifier = z.string().regex(/^[\w-]{1,128}$/);
export const savingsSchema = z.object({
  requestId: z.string().uuid(),
  goalId: identifier,
  type: z.enum(["contribution", "withdrawal"]),
  amount: z.number().positive().max(10000000).multipleOf(0.01),
  date: dateSchema,
  note: z.string().trim().max(400).default(""),
});
export const scheduleSchema = z
  .object({
    id: identifier.optional(),
    title: z.string().trim().min(1).max(120),
    kind: z.enum(["income", "payment", "saving"]),
    amount: z.number().positive().max(10000000).multipleOf(0.01),
    nextDate: dateSchema,
    frequency: z.enum(["once", "weekly", "biweekly", "monthly"]),
    category: z.enum(categories).default("Otros"),
    goalId: identifier.optional(),
  })
  .refine((s) => s.kind !== "saving" || !!s.goalId, "Selecciona una meta");
export function nextOccurrence(
  date: string,
  frequency: string,
  anchorDay?: number,
): string | null {
  if (frequency === "once") return null;
  const d = new Date(date + "T12:00:00Z");
  if (frequency === "monthly") {
    const day = anchorDay ?? d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    const last = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  } else d.setUTCDate(d.getUTCDate() + (frequency === "weekly" ? 7 : 14));
  return d.toISOString().slice(0, 10);
}
export function weekStart(date: string) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export function savingsStats(entries: any[], today: string) {
  const weekly = new Map<string, number>();
  for (const e of entries) {
    if (e.date > today || !["contribution", "withdrawal"].includes(e.type))
      continue;
    const w = weekStart(e.date);
    weekly.set(
      w,
      round(
        (weekly.get(w) ?? 0) + (e.type === "withdrawal" ? -e.amount : e.amount),
      ),
    );
  }
  const currentWeek = weekStart(today);
  let cursor = currentWeek,
    streak = 0;
  if ((weekly.get(cursor) ?? 0) <= 0) {
    const d = new Date(cursor + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 7);
    cursor = d.toISOString().slice(0, 10);
  }
  while ((weekly.get(cursor) ?? 0) > 0) {
    streak++;
    const d = new Date(cursor + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 7);
    cursor = d.toISOString().slice(0, 10);
  }
  return {
    streak,
    weeklyNet: weekly.get(currentWeek) ?? 0,
    source: "manual",
    currentWeek,
  };
}
export const ledgerSummary = summarize;
