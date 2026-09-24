import { useRef, useState, useEffect } from "react";
import { call, errorMessage } from "./firebase";
import { type CartItem } from "./types";
import { Button, ErrorText } from "./ui";
export function RetailerCart({ items }: { items: CartItem[] }) {
  const [result, setResult] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const revision = useRef(0);
  useEffect(() => {
    revision.current++;
    setResult(null);
    setError("");
    setBusy(false);
  }, [items]);
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
    <section className="card" aria-label="Carrito en H-E-B">
      <h2>Continuar el mandado en H-E-B</h2>
      <p>
        Esta conexión está en validación. Comprobaremos que toda la lista tenga
        la misma marca y presentación antes de habilitar el envío.
      </p>
      <Button
        className="secondary"
        busy={busy}
        disabled={!items.some((i) => i.selected)}
        onClick={prepare}
      >
        Comprobar envío a H-E-B
      </Button>
      <ErrorText text={error} />
      {result && (
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
    </section>
  );
}
