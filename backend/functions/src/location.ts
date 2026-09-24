import { z } from "zod";
import { getCACertificates, setDefaultCACertificates } from "node:tls";
export const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const locationSchema = z
  .object({
    municipality: z.string().trim().min(1).max(120),
    state: z.string().trim().max(120).default(""),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    source: z.enum(["manual", "browser"]).default("manual"),
  })
  .refine(
    (v) => (v.latitude === undefined) === (v.longitude === undefined),
    "Completa ambas coordenadas",
  );
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = (n: number) => (n * Math.PI) / 180;
  const dlat = rad(b.latitude - a.latitude),
    dlng = rad(b.longitude - a.longitude);
  const x =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(dlng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
}
export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export function locationNames(address: Record<string, unknown>) {
  const text = (key: string) =>
    typeof address[key] === "string" ? String(address[key]).trim() : "";
  return {
    municipality:
      text("municipality") ||
      text("county") ||
      text("city") ||
      text("town") ||
      text("village") ||
      text("city_district"),
    state: text("state") || text("region"),
  };
}

export async function reverseGeocode(latitude: number, longitude: number) {
  // The Windows emulator runs behind the host trust store; keep TLS validation
  // enabled while adding those trusted roots. Production uses Node defaults.
  if (process.platform === "win32" && process.env.FUNCTIONS_EMULATOR === "true")
    setDefaultCACertificates([
      ...getCACertificates("default"),
      ...getCACertificates("system"),
    ]);
  const endpoint = new URL(
    process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org/reverse",
  );
  endpoint.searchParams.set("format", "jsonv2");
  endpoint.searchParams.set("lat", String(latitude));
  endpoint.searchParams.set("lon", String(longitude));
  endpoint.searchParams.set("zoom", "10");
  endpoint.searchParams.set("addressdetails", "1");
  endpoint.searchParams.set("accept-language", "es-MX,es");
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Summa-HackaTec/1.0 (+https://github.com/ingridpadillaa/hackaher_regional)",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(`Reverse geocoder returned ${response.status}`);
  const result = (await response.json()) as {
    address?: Record<string, unknown>;
  };
  const names = locationNames(result.address ?? {});
  if (!names.municipality || !names.state)
    throw new Error("Reverse geocoder did not return a municipality and state");
  return {
    ...names,
    latitude,
    longitude,
    source: "browser" as const,
    provider: "OpenStreetMap",
  };
}
