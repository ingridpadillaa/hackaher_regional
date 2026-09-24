import { round } from "./domain";
import { distanceKm, normalize } from "./location";
export function compareStores(
  items: any[],
  stores: any[],
  prices: any[],
  area: any,
  today: string,
  historical = false,
  sort = "price",
) {
  const offers = new Map(prices.map((p) => [`${p.productId}_${p.storeId}`, p]));
  return stores
    .map((store) => {
      const distance =
        area.latitude !== undefined &&
        area.longitude !== undefined &&
        store.latitude !== undefined &&
        store.longitude !== undefined
          ? distanceKm(area, store)
          : null;
      let subtotal = 0,
        matched = 0,
        stale = 0;
      const missing: string[] = [],
        dates: string[] = [];
      const lines = items.map((item) => {
        const offer = offers.get(`${item.id}_${store.id}`);
        const age = offer
          ? Math.round((Date.parse(today) - Date.parse(offer.date)) / 86400000)
          : NaN;
        const valid =
          offer &&
          Number.isFinite(offer.price) &&
          offer.price > 0 &&
          Number.isFinite(age) &&
          age >= 0 &&
          !!offer.source;
        const old = valid && age > 30;
        if (old) stale++;
        if (!valid || (old && !historical)) {
          missing.push(item.name);
          return {
            name: item.name,
            quantity: item.quantity,
            price: null,
            stale: !!old,
          };
        }
        matched++;
        subtotal += offer.price * item.quantity;
        dates.push(offer.date);
        return {
          name: item.name,
          quantity: item.quantity,
          price: offer.price,
          total: round(offer.price * item.quantity),
          date: offer.date,
          source: offer.source,
          sourceUrl: offer.sourceUrl,
          stale: !!old,
        };
      });
      const complete = matched === items.length && items.length > 0;
      return {
        ...store,
        distanceKm: distance === null ? null : round(distance),
        total: complete ? round(subtotal) : null,
        subtotal: round(subtotal),
        complete,
        matchedCount: matched,
        missingCount: missing.length,
        missing,
        staleCount: stale,
        historical: historical && stale > 0,
        date: dates.sort()[0] ?? null,
        lines,
        cartReady: false,
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.name} ${store.address} ${store.municipality}`)}`,
      };
    })
    .filter(
      (s) =>
        area.latitude === undefined ||
        (s.distanceKm !== null && s.distanceKm <= 20),
    )
    .sort((a, b) => {
      if (sort === "distance")
        return (
          (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) ||
          b.matchedCount - a.matchedCount
        );
      if (a.complete !== b.complete) return a.complete ? -1 : 1;
      if (a.complete) return a.total! - b.total!;
      return (
        b.matchedCount - a.matchedCount ||
        (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) ||
        a.name.localeCompare(b.name)
      );
    })
    .slice(0, 3);
}
export async function catalogStores(db: any, area: any) {
  // Reverse geocoding always supplies the municipality. Querying the whole
  // state with a limit could exclude the nearby branches as the catalog grows.
  const query = db
    .collection("stores")
    .where("municipalityKey", "==", normalize(area.municipality));
  const snap = await query.limit(250).get();
  return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
}
