import { z } from "zod";

const origin = "https://www.heb.com.mx";
const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const mappingSchema = z.object({
  productId: identifier,
  sku: z.string().regex(/^\d{1,20}$/),
  seller: identifier,
  salesChannel: z.string().regex(/^\d{1,8}$/),
  productUrl: z
    .string()
    .url()
    .refine((value) => {
      const u = new URL(value);
      return (
        u.origin === origin &&
        !u.username &&
        !u.password &&
        u.pathname.endsWith("/p") &&
        !u.search &&
        !u.hash
      );
    }),
  match: z.literal("exact"),
  verifiedAt: z.string().datetime(),
});
const configSchema = z.object({
  enabled: z.literal(true),
  verification: z.object({
    status: z.literal("verified"),
    checkedAt: z.string().datetime(),
    salesChannel: z.string().regex(/^\d{1,8}$/),
    evidenceId: identifier,
    // Verified in the receiving browser session, not merely HTTP 200 or URL construction.
    quantitiesMatched: z.literal(true),
    existingCartPreserved: z.literal(true),
  }),
});
function recent(value: string, now: number) {
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) && stamp <= now && now - stamp <= 7 * 86400000;
}
export function prepareHebCart(
  items: { id: string; quantity: number; selected: boolean }[],
  mappings: unknown[],
  config: unknown,
  now = Date.now(),
) {
  const selected = items.filter((i) => i.selected);
  const base = {
    retailer: "H-E-B",
    ready: false,
    url: null as string | null,
    itemCount: selected.length,
  };
  if (!selected.length)
    return {
      ...base,
      reason: "empty",
      message: "Tu mandado no tiene productos seleccionados.",
    };
  const checked = configSchema.safeParse(config);
  if (!checked.success || !recent(checked.data.verification.checkedAt, now))
    return {
      ...base,
      reason: "unverified",
      message:
        "El envío del mandado a H-E-B está pendiente de verificación. Aún no podemos confirmar que su carrito reciba los productos.",
    };
  if (
    selected.length > 40 ||
    selected.some(
      (i) => !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 99,
    ) ||
    new Set(selected.map((i) => i.id)).size !== selected.length
  )
    return {
      ...base,
      reason: "unsupported_quantity",
      message:
        "La transferencia admite hasta 40 productos distintos, con cantidades enteras entre 1 y 99. Los productos por peso requieren otra integración.",
    };
  const valid = mappings
    .map((m) => mappingSchema.safeParse(m))
    .flatMap((m) =>
      m.success && recent(m.data.verifiedAt, now) ? [m.data] : [],
    );
  const missingIds = selected
    .filter(
      (i) =>
        valid.filter(
          (m) =>
            m.productId === i.id &&
            m.salesChannel === checked.data.verification.salesChannel,
        ).length !== 1,
    )
    .map((i) => i.id);
  if (missingIds.length)
    return {
      ...base,
      reason: "missing_mapping",
      missingIds,
      message: `Falta verificar la misma marca y presentación en H-E-B para ${missingIds.length} productos. No se enviará un carrito incompleto.`,
    };
  const tuples = selected.map((i) => ({
    quantity: i.quantity,
    ...valid.find(
      (m) =>
        m.productId === i.id &&
        m.salesChannel === checked.data.verification.salesChannel,
    )!,
  }));
  if (new Set(tuples.map((m) => `${m.sku}:${m.seller}`)).size !== tuples.length)
    return {
      ...base,
      reason: "ambiguous_mapping",
      message:
        "Dos productos apuntan al mismo artículo de H-E-B. Es necesario revisar la equivalencia.",
    };
  const url = new URL("/checkout/cart/add", origin);
  for (const m of tuples) {
    url.searchParams.append("sku", m.sku);
    url.searchParams.append("qty", String(m.quantity));
    url.searchParams.append("seller", m.seller);
  }
  url.searchParams.set("sc", checked.data.verification.salesChannel);
  url.searchParams.set("redirect", "true");
  if (url.toString().length > 6000)
    return {
      ...base,
      reason: "too_long",
      message: "El mandado supera el tamaño permitido para este enlace.",
    };
  return {
    ...base,
    ready: true,
    url: url.toString(),
    reason: "verified",
    verifiedAt: checked.data.verification.checkedAt,
    message:
      "Al abrir H-E-B se agregarán estos productos a tu carrito. Revisa sucursal, existencias, cantidades y precios finales allí antes de pagar. Si abres el enlace otra vez, revisa que las cantidades no se dupliquen.",
  };
}
