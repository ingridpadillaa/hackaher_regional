import { createHash } from "node:crypto";
import { z } from "zod";
import { categories, round } from "./domain";
export const receiptSchema = z.object({
  merchant: z.string().max(120).default(""),
  total: z.number().nonnegative().max(10000000).nullable(),
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(160),
        quantity: z.number().positive().max(10000),
        amount: z.number().nonnegative().max(10000000),
        category: z.enum(categories),
      }),
    )
    .max(100),
});
export const ruleKey = (note: string) =>
  createHash("sha256")
    .update(
      note
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim(),
    )
    .digest("hex");
export function reconcileReceipt(result: any, method: string, date: string) {
  if (!result.receipt || method !== "ticket") return result;
  const receipt = result.receipt;
  const total = receipt.total;
  const sum = round(
    receipt.items.reduce((s: number, i: any) => s + i.amount, 0),
  );
  if (total === null || !receipt.items.length) {
    result.warning +=
      " No hay desglose completo; revisa el total y los datos faltantes.";
    return result;
  }
  if (Math.abs(sum - total) > 0.02) {
    result.warning += ` El desglose suma ${sum.toFixed(2)} y el total leído es ${total.toFixed(2)}. Revisa descuentos, impuestos o líneas faltantes; no se dividió el gasto.`;
    // Do not persist both line items and a total when they cannot be reconciled.
    result.movements =
      total > 0
        ? [
            {
              type: "gasto",
              amount: round(total),
              category: "Otros",
              note: receipt.merchant || "Ticket por revisar",
              date: result.movements[0]?.date ?? date,
            },
          ]
        : [];
    return result;
  }
  const grouped = new Map<string, number>();
  for (const item of receipt.items)
    grouped.set(
      item.category,
      round((grouped.get(item.category) ?? 0) + item.amount),
    );
  const expenseDate = result.movements[0]?.date ?? date;
  result.movements = [...grouped]
    .filter(([, amount]) => amount > 0)
    .map(([category, amount]) => ({
      type: "gasto",
      amount,
      category,
      note: `${receipt.merchant || "Ticket"} · ${category}`,
      date: expenseDate,
    }));
  result.warning +=
    " El total se distribuyó por categoría; no se registra un gasto adicional por el total.";
  return result;
}
