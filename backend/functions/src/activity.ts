/** Daily personal review, independent of savings and bank balances. */
export function localDay(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Monterrey",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
const previousDay = (day: string) =>
  new Date(Date.parse(day + "T12:00:00Z") - 86400000)
    .toISOString()
    .slice(0, 10);
export function activityStats(
  movements: any[],
  confirmations: any[],
  uid: string,
  today: string,
) {
  const expenses = new Set<string>(
    movements
      .filter(
        (m) =>
          m.ownerUid === uid &&
          m.type === "gasto" &&
          m.date <= today &&
          ["manual", "ticket", "pdf", "audio", "foto", "voz"].includes(
            m.method,
          ) &&
          localDay(m.createdAt) === m.date,
      )
      .map((m) => m.date),
  );
  const days = new Set<string>([
    ...expenses,
    ...confirmations
      .filter(
        (c) =>
          c.noExpense === true &&
          c.date <= today &&
          /^\d{4}-\d{2}-\d{2}$/.test(c.date),
      )
      .map((c) => c.date),
  ]);
  let streak = 0,
    cursor = days.has(today) ? today : previousDay(today);
  while (days.has(cursor)) {
    streak++;
    cursor = previousDay(cursor);
  }
  let best = 0,
    run = 0,
    last = "";
  for (const day of [...days].sort()) {
    run = previousDay(day) === last ? run + 1 : 1;
    best = Math.max(best, run);
    last = day;
  }
  return {
    streak,
    best,
    monthDays: [...days].filter((day) => day.slice(0, 7) === today.slice(0, 7))
      .length,
    todayStatus: expenses.has(today)
      ? "expense"
      : days.has(today)
        ? "no-expense"
        : "pending",
  };
}
