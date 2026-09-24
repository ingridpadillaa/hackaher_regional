import { z } from "zod";
export const categories = [
  "Vivienda",
  "Alimentación",
  "Transporte",
  "Salud",
  "Educación",
  "Recreación",
  "Servicios",
  "Ropa",
  "Otros",
] as const;
const text = z.string().trim().min(1).max(120);
export const memberSchema = z.object({
  id: z
    .string()
    .regex(/^[\w-]{1,128}$/)
    .optional(),
  name: text,
  age: z.number().int().min(0).max(120),
  relationship: text,
  education: z.string().max(80).default(""),
  occupation: z.string().max(80).default(""),
  income: z.number().min(0).max(10000000),
  period: z.enum(["mensual", "quincenal", "semanal"]).default("mensual"),
});
export const homeSchema = z.object({
  name: text,
  members: z.array(memberSchema).min(1).max(20),
});
export const preferencesSchema = z.object({
  municipality: text,
  monthlyBudget: z.number().min(0).max(1000000000).optional(),
  lifestyle: z.string().max(400),
  priorities: z.array(z.string().max(80)).max(8),
  assistantTone: z.enum(["cercano", "directo", "motivador"]),
  aiConsent: z.boolean(),
  bankConsent: z.boolean(),
  privacyAccepted: z.literal(true),
  alerts: z.boolean(),
  goals: z.boolean(),
  donations: z.boolean(),
  members: z.array(memberSchema).min(1).max(20),
});
export const movementSchema = z.object({
  requestId: z.string().uuid(),
  type: z.enum(["gasto", "ingreso"]),
  amount: z.number().positive().max(10000000),
  category: z.enum(categories).default("Otros"),
  note: z.string().trim().max(400),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (s) =>
        !Number.isNaN(Date.parse(s)) &&
        new Date(s).toISOString().slice(0, 10) === s,
      "Fecha inválida",
    ),
  method: z.enum(["manual", "pdf", "audio", "ticket"]),
  draftId: z
    .string()
    .regex(/^[\w-]{1,128}$/)
    .optional(),
  draftIndex: z.number().int().min(0).max(49).optional(),
});
export const cartSchema = z
  .array(
    z.object({
      id: z.string().regex(/^[\w-]{1,128}$/),
      name: text,
      quantity: z.number().positive().max(999),
      unit: z.string().max(30),
      selected: z.boolean(),
    }),
  )
  .max(60);
export const round = (n: number) =>
  Math.round((n + Number.EPSILON) * 100) / 100;
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Monterrey",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const monthlyIncome = (members: any[]) =>
  round(
    members.reduce(
      (s, m) =>
        s +
        m.income *
          (m.period === "semanal" ? 52 / 12 : m.period === "quincenal" ? 2 : 1),
      0,
    ),
  );
export function summarize(movements: any[], budget: number) {
  const expenses = round(
    movements
      .filter((m) => m.type === "gasto")
      .reduce((s, m) => s + m.amount, 0),
  );
  const extraIncome = round(
    movements
      .filter((m) => m.type === "ingreso")
      .reduce((s, m) => s + m.amount, 0),
  );
  const byCategory = categories.map((name) => ({
    name,
    amount: round(
      movements
        .filter((m) => m.type === "gasto" && m.category === name)
        .reduce((s, m) => s + m.amount, 0),
    ),
  }));
  return {
    expenses,
    extraIncome,
    budget,
    remaining: round(budget + extraIncome - expenses),
    byCategory,
  };
}
// Fixed Mexican calendar dates only. Amounts always come from this household's history.
const seasonalDates = [
  ["Día de Reyes", 1, 6],
  ["Día del Niño", 4, 30],
  ["Día de las Madres", 5, 10],
  ["Fiestas Patrias", 9, 16],
  ["Día de Muertos", 11, 2],
  ["Navidad", 12, 25],
] as const;
export function seasonalForecast(date: string, history: any[]) {
  const year = Number(date.slice(0, 4));
  const next = [
    ...seasonalDates.map(([name, m, d]) => ({
      name,
      date: `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    })),
    { name: "Día de Reyes", date: `${year + 1}-01-06` },
  ].find((e) => e.date >= date)!;
  const target = new Date(next.date + "T12:00:00Z");
  const prior = new Date(target);
  prior.setUTCFullYear(prior.getUTCFullYear() - 1);
  const expenses = history.filter((m) => m.type === "gasto");
  const days = new Set(expenses.map((m) => m.date)).size;
  const window = expenses.filter(
    (m) =>
      Math.abs(Date.parse(m.date + "T12:00:00Z") - prior.getTime()) <=
      7 * 86400000,
  );
  const baseline = expenses.filter((m) => !window.includes(m));
  const baseDays = new Set(baseline.map((m) => m.date)).size;
  const extra =
    days >= 30 && window.length && baseDays
      ? Math.max(
          0,
          round(
            window.reduce((s, m) => s + m.amount, 0) -
              (baseline.reduce((s, m) => s + m.amount, 0) / baseDays) * 15,
          ),
        )
      : null;
  return {
    ...next,
    extra,
    source:
      extra === null
        ? "Sin historial comparable suficiente"
        : "Estimación basada en el mismo periodo del año pasado",
  };
}
export function verifiedStreak(evidence: any[], date: string) {
  const map = new Map(
    evidence
      .filter(
        (e) =>
          e.verified === true &&
          e.source === "open_banking" &&
          typeof e.netSavings === "number",
      )
      .map((e) => [e.date, e]),
  );
  const d = new Date(date + "T12:00:00Z");
  if (!map.has(date)) d.setUTCDate(d.getUTCDate() - 1);
  let count = 0;
  while (count < 366) {
    const e = map.get(d.toISOString().slice(0, 10));
    if (!e || e.netSavings <= 0) break;
    count++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return count;
}
export function simulate(
  target: number,
  saved: number,
  contribution: number,
  period: string,
) {
  const remaining = Math.max(0, round(target - saved));
  return {
    remaining,
    periods: contribution > 0 ? Math.ceil(remaining / contribution) : null,
    period,
  };
}
