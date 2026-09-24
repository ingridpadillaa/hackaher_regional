import { useEffect, useRef, useState } from "react";
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  ArrowRight,
  BarChart3,
  Copy,
  Trash2,
} from "lucide-react";
import { type State, type CartItem, money } from "./types";
import { Logo, Jami, Button, Empty, ErrorText, Modal, Field } from "./ui";
import { call, errorMessage } from "./firebase";
export function Cart({
  state,
  onSaved,
}: {
  state: State;
  onSaved: () => Promise<void>;
}) {
  const [items, setItems] = useState<CartItem[]>(state.cart);
  const [term, setTerm] = useState("");
  const [products, setProducts] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [unit, setUnit] = useState("pieza");
  const [selectedStore, setSelectedStore] = useState<any>(null);
  const revision = useRef(0);
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const current = ++revision.current;
    if (term.trim().length < 2) {
      setProducts([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const result = await call("searchProducts", { term });
        if (current === revision.current) setProducts(result);
      } catch (e) {
        if (current === revision.current) setError(errorMessage(e));
      } finally {
        if (current === revision.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [term]);
  useEffect(() => {
    let live = true;
    call("compareCart", { items: state.cart })
      .then((r) => live && setOffers(r))
      .catch((e) => live && setError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, []);
  function update(next: CartItem[]) {
    setItems(next);
    setDirty(true);
    setOffers([]);
  }
  function add(p: any) {
    if (items.some((i) => i.id === p.id)) {
      update(
        items.map((i) =>
          i.id === p.id ? { ...i, quantity: i.quantity + 1 } : i,
        ),
      );
    } else
      update([
        ...items,
        {
          id: p.id,
          name: p.name,
          quantity: 1,
          unit: p.unit ?? "pieza",
          selected: true,
        },
      ]);
    setTerm("");
    setProducts([]);
    setShowAdd(false);
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await call("saveCart", { items });
      const o = await call("compareCart", { items });
      setOffers(o);
      setDirty(false);
      await onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        items
          .filter((i) => i.selected)
          .map((i) => `${i.quantity} ${i.unit} · ${i.name}`)
          .join("\n"),
      );
      setCopied(true);
    } catch {
      setError(
        "No pudimos copiar. Puedes seleccionar los productos desde esta lista.",
      );
    }
  }
  const count = items.filter((i) => i.selected).length;
  return (
    <main className="page cart-page">
      <Logo />
      <header className="center-title">
        <h1>
          Creación <em>óptima de gasto</em>
        </h1>
        <p>para partida de consumos (carrito de despensa)</p>
      </header>
      <div className="search-input">
        <Search />
        <input
          aria-label="Buscar un producto"
          placeholder="Buscar un producto…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <button
          className="icon-button pink"
          aria-label="Agregar producto a mi lista"
          onClick={() => setShowAdd(true)}
        >
          <Plus />
        </button>
      </div>
      {term.length >= 2 && (
        <div className="search-results">
          {searching ? (
            <p>Buscando…</p>
          ) : products.length ? (
            products.map((p) => (
              <button key={p.id} onClick={() => add(p)}>
                {p.name}
                <small>{p.unit}</small>
                <Plus size={18} />
              </button>
            ))
          ) : (
            <p>
              No hay coincidencias en el catálogo.{" "}
              <button className="text-button" onClick={() => setShowAdd(true)}>
                Agregar a mi lista
              </button>
            </p>
          )}
        </div>
      )}
      <div className="jami-message">
        <Jami kind="carrito" />
        <div className="speech">
          <h3>Jami te sugiere</h3>
          <p>
            {items.length
              ? "Ajusta las cantidades y compara la misma lista entre tiendas."
              : "Agrega tus productos y construyamos tu próxima compra."}
          </p>
        </div>
      </div>
      <section className="card shopping-list">
        <div className="section-heading between">
          <h2>
            <ShoppingCart className="pink" />
            Mi próxima compra
          </h2>
          <span className="badge">{count} productos</span>
        </div>
        {items.length ? (
          items.map((item) => (
            <div className="shopping-row" key={item.id}>
              <input
                type="checkbox"
                aria-label={`Incluir ${item.name}`}
                checked={item.selected}
                onChange={(e) =>
                  update(
                    items.map((i) =>
                      i.id === item.id
                        ? { ...i, selected: e.target.checked }
                        : i,
                    ),
                  )
                }
              />
              <span className="product-symbol">
                <ShoppingCart size={19} />
              </span>
              <span>
                <strong>{item.name}</strong>
                <small>
                  {item.quantity} {item.unit}
                </small>
              </span>
              <div className="quantity">
                <button
                  aria-label={`Quitar una unidad de ${item.name}`}
                  disabled={item.quantity <= 1}
                  onClick={() =>
                    update(
                      items.map((i) =>
                        i.id === item.id
                          ? { ...i, quantity: i.quantity - 1 }
                          : i,
                      ),
                    )
                  }
                >
                  <Minus size={18} />
                </button>
                <b>{item.quantity}</b>
                <button
                  aria-label={`Agregar una unidad de ${item.name}`}
                  disabled={item.quantity >= 999}
                  onClick={() =>
                    update(
                      items.map((i) =>
                        i.id === item.id
                          ? { ...i, quantity: i.quantity + 1 }
                          : i,
                      ),
                    )
                  }
                >
                  <Plus size={18} />
                </button>
              </div>
              <button
                className="icon-button"
                aria-label={`Eliminar ${item.name}`}
                onClick={() => update(items.filter((i) => i.id !== item.id))}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))
        ) : (
          <Empty>
            <ShoppingCart />
            <p>
              Tu lista comienza contigo.
              <br />
              Busca o agrega tu primer producto.
            </p>
          </Empty>
        )}
        {dirty && (
          <Button busy={busy} onClick={save}>
            Guardar y comparar
          </Button>
        )}
      </section>
      <div className="section-heading comparison-title">
        <BarChart3 className="pink" />
        <div>
          <h2>Mejores 3 opciones para ti</h2>
          <p>Mismo carrito, diferentes precios</p>
        </div>
      </div>
      <ErrorText text={error} />
      {!offers.length ? (
        <Empty>
          {dirty
            ? "Guarda tu lista para actualizar las opciones."
            : "Selecciona productos para comparar tu carrito."}
        </Empty>
      ) : (
        <>
          <div className="store-grid">
            {offers.map((s, i) => (
              <article className={"store-card rank-" + i} key={s.id}>
                <span className="rank">{s.total !== null ? i + 1 : "—"}</span>
                <h3>{s.name}</h3>
                {s.total !== null ? (
                  <>
                    <strong className="store-price">
                      {money(s.total)}
                      <small> MXN</small>
                    </strong>
                    <span className="green">
                      {i === 0
                        ? "Menor precio disponible"
                        : `Diferencia: ${money(s.total - offers[0].total)}`}
                    </span>
                    <small>Referencia · {s.date}</small>
                  </>
                ) : (
                  <>
                    <strong className="no-price">
                      Sin precio
                      <br />
                      verificado
                    </strong>
                    <small>Falta catálogo para tu lista y municipio.</small>
                  </>
                )}
                <button
                  onClick={() => {
                    setCopied(false);
                    setSelectedStore(s);
                  }}
                >
                  Ir a {s.name}
                  <ArrowRight size={15} />
                </button>
              </article>
            ))}
          </div>
          <p className="helper">
            Los precios de referencia pueden variar en tienda. No se asignan
            precios a productos sin datos.
          </p>
        </>
      )}
      {selectedStore && (
        <Modal
          title={`Tu lista para ${selectedStore.name}`}
          onClose={() => setSelectedStore(null)}
        >
          <p>
            La transferencia automática del carrito aún no está disponible para
            esta tienda. Puedes copiar tu lista y comprar en su sitio oficial.
          </p>
          <ul className="copy-list">
            {items
              .filter((i) => i.selected)
              .map((i) => (
                <li key={i.id}>
                  {i.quantity} {i.unit} · {i.name}
                </li>
              ))}
          </ul>
          <Button className="secondary" onClick={copy}>
            <Copy size={18} />
            {copied ? "Lista copiada" : "Copiar lista"}
          </Button>
          {selectedStore.productLinks?.map((p: any) => (
            <a key={p.url} href={p.url} target="_blank" rel="noreferrer">
              {p.name} ↗
            </a>
          ))}
          <a
            className="button"
            href={selectedStore.url}
            target="_blank"
            rel="noreferrer"
          >
            Abrir {selectedStore.name}
            <ArrowRight size={18} />
          </a>
        </Modal>
      )}
      {showAdd && (
        <Modal
          title="Agregar a mi próxima compra"
          onClose={() => setShowAdd(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add({ id: crypto.randomUUID(), name: term.trim(), unit });
            }}
          >
            <Field label="Producto">
              <input
                required
                maxLength={120}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />
            </Field>
            <Field label="Unidad">
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                {["pieza", "kg", "L", "paquete", "docena"].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </Field>
            <p className="helper">
              Un producto agregado manualmente necesita vincularse a un catálogo
              real para comparar precios.
            </p>
            <Button>Agregar producto</Button>
          </form>
        </Modal>
      )}
    </main>
  );
}
