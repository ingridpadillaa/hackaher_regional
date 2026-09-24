import { useRef, useState, useEffect } from "react";
import { call, errorMessage } from "./firebase";
import { money, type CartItem } from "./types";
import { Button, ErrorText } from "./ui";
export function RetailerCart({
  items,
  store,
}: {
  items: CartItem[];
  store?: any;
}) {
  const [result, setResult] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const revision = useRef(0);
  useEffect(() => {
    revision.current++;
    setResult(null);
    setError("");
    setBusy(false);
  }, [items, store?.id]);
  const isHeb = /\bheb\b|h-e-b/i.test(
    `${store?.name ?? ""} ${store?.chain ?? ""}`,
  );
  async function prepare() {
    const current = ++revision.current;
    setBusy(true);
    setError("");
    try {
      const response = await call("prepareRetailerCart", {
        retailer: "heb",
        items,
      });
      if (current === revision.current) setResult(response);
    } catch (e) {
      if (current === revision.current) setError(errorMessage(e));
    } finally {
      if (current === revision.current) setBusy(false);
    }
  }
  useEffect(
    () => () => {
      revision.current++;
    },
    [],
  );
  return (
    <section
      className="card"
      aria-label={
        store ? `Opción más barata: ${store.name}` : "Opción más barata"
      }
    >
      <h2>{store ? `Continúa en ${store.name}` : "Opción más barata"}</h2>
      {!store ? (
        <p>
          La tienda más barata aparecerá cuando exista una lista completa con
          precios utilizables para tu ubicación.
        </p>
      ) : (
        <>
          <p>
            Es la lista completa con menor total:{" "}
            <strong>{money(store.total)}</strong>. Confirma existencias y precio
            final directamente con la tienda.
          </p>
          {isHeb ? (
            <>
              <Button
                className="secondary"
                busy={busy}
                disabled={!items.some((i) => i.selected)}
                onClick={prepare}
              >
                Comprobar envío a H-E-B
              </Button>
              <ErrorText text={error} />
            </>
          ) : (
            <a
              className="button"
              href={store.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ver {store.name}
            </a>
          )}
          {isHeb && result && (
            <>
              <p role="status">{result.message}</p>
              {result.missingIds?.length > 0 && (
                <ul>
                  {items
                    .filter((i) => result.missingIds.includes(i.id))
                    .map((i) => (
                      <li key={i.id}>{i.name}</li>
                    ))}
                </ul>
              )}
              {result.ready && result.url && (
                <a
                  className="button"
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                >
                  Abrir mi mandado en H-E-B
                </a>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
