import { useEffect, useRef, useState } from "react";
import { LocationPicker, type Area } from "./LocationPicker";
import { RetailerCart } from "./RetailerCart";
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
import { Jami, Button, Empty, ErrorText, Modal, Field } from "./ui";
import { call, errorMessage } from "./firebase";
export function Cart({
  state,
  onSaved,
}: {
  state: State;
  onSaved: () => Promise<void>;
}) {
  const [area, setArea] = useState<Area>(
    state.home?.location ?? {
      municipality: state.home?.preferences?.municipality ?? "",
      state: "",
      source: "manual",
    },
  );
  const [historical, setHistorical] = useState(false);
  const [sort, setSort] = useState("price");
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
  const comparisonVersion = useRef(0);
  function invalidate() {
    comparisonVersion.current++;
    setOffers([]);
    setDirty(true);
  }
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const current = ++revision.current;
    if (term.trim().length < 2) {
      setProducts([]);
      setSearching(false);
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
    const version = ++comparisonVersion.current;
    call("compareCart", { items: state.cart, area, historical, sort })
      .then(
        (r) => live && version === comparisonVersion.current && setOffers(r),
      )
      .catch((e) => live && setError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, []);
  function update(next: CartItem[]) {
    setItems(next);
    invalidate();
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
    const version = ++comparisonVersion.current;
    setBusy(true);
    setError("");
    try {
      await call("saveCart", { items });
      const o = await call("compareCart", { items, area, historical, sort });
      if (version === comparisonVersion.current) {
        setOffers(o);
        setDirty(false);
      }
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
      <section className="card" aria-label="Supermercados cercanos">
        <h2>Zona para esta compra</h2>
        <LocationPicker
          temporary
          value={area}
          onChange={(a) => {
            setArea(a);
            invalidate();
          }}
        />
        <Field label="Ordenar sucursales">
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              invalidate();
            }}
          >
            <option value="price">Precio de la misma lista</option>
            <option value="distance">Cercanía (requiere ubicación)</option>
          </select>
        </Field>
        <label className="check-line">
          <input
            type="checkbox"
            checked={historical}
            onChange={(e) => {
              setHistorical(e.target.checked);
              invalidate();
            }}
          />
          <span>
            Incluir referencias históricas de más de 30 días. No son precios
            actuales.
          </span>
        </label>
        <p className="helper">
          Sucursales del catálogo PROFECO. La distancia es aproximada en línea
          recta, no una ruta. Las valoraciones de Google no están conectadas.
        </p>
      </section>
      <div className="section-heading comparison-title">
        <BarChart3 className="pink" />
        <div>
          <h2>Compara hasta 4 sucursales</h2>
          <p>Mismos productos y presentaciones, con fuente y fecha</p>
        </div>
      </div>
      <ErrorText text={error} />
      {!offers.length ? (
        <Empty>
          {dirty
            ? "Guarda tu lista para actualizar las opciones."
            : "No hay comparaciones para esta lista y zona. Busca productos del catálogo, revisa la ubicación o habilita referencias históricas."}
        </Empty>
      ) : (
        <>
          <div className="store-grid">
            {offers.map((s, i) => (
              <article className={"store-card rank-" + i} key={s.id}>
                <span className="rank">{s.complete ? i + 1 : "—"}</span>
                <h3>{s.name}</h3>
                {s.total !== null ? (
                  <>
                    <strong className="store-price">
                      {money(s.total)}
                      <small> MXN</small>
                    </strong>
                    <span>
                      {s.historical
                        ? "Comparación histórica · no vigente"
                        : sort === "price" && i === 0
                          ? "Menor total entre listas completas"
                          : "Lista completa"}
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
                    <small>
                      No se calcula total con productos sin precio utilizable.
                    </small>
                  </>
                )}
                <p>
                  {s.matchedCount} de {count} productos con precio
                </p>
                {s.distanceKm !== null && (
                  <small>{s.distanceKm} km aprox.</small>
                )}
                <small>{s.address}</small>
                {s.staleCount > 0 && (
                  <small>{s.staleCount} precios de más de 30 días.</small>
                )}
                <button
                  onClick={() => {
                    setCopied(false);
                    setSelectedStore(s);
                  }}
                >
                  Ver {s.name}
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
      <RetailerCart items={items} />
      {selectedStore && (
        <Modal
          title={`Tu lista para ${selectedStore.name}`}
          onClose={() => setSelectedStore(null)}
        >
          <p>
            La transferencia automática del carrito aún no está disponible para
            esta tienda. Puedes copiar tu lista y consultar la ubicación de la
            sucursal.
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
          <div className="comparison-lines">
            {selectedStore.lines?.map((line: any, i: number) => (
              <p key={i}>
                <strong>{line.name}</strong>:{" "}
                {line.price === null
                  ? line.stale
                    ? "Referencia antigua no incluida"
                    : "Sin precio"
                  : `${money(line.price)} × ${line.quantity} = ${money(line.total)}`}
                <small>
                  {line.date ?? ""} · {line.source ?? "PROFECO"}
                </small>
              </p>
            ))}
          </div>
          <a
            className="button"
            href={selectedStore.url}
            target="_blank"
            rel="noreferrer"
          >
            Ver sucursal en Google Maps
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
