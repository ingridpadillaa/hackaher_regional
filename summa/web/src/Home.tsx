import { useState } from "react";
import { Plus, ChevronRight, Receipt, CheckCircle2 } from "lucide-react";
import { type State, type Movement, money, dateLabel } from "./types";
import { CategoryIcon, Empty, Modal, Button, ErrorText } from "./ui";
import { call, errorMessage } from "./firebase";
const colors = [
  "#fa4d7c",
  "#ffae53",
  "#91baf1",
  "#c8a9e8",
  "#8bcca9",
  "#f6c657",
  "#ee91ad",
  "#9fb9a0",
  "#b1afb5",
];
export function History({
  items,
  onAll,
}: {
  items: Movement[];
  onAll?: () => void;
}) {
  return (
    <section className="history">
      <div className="section-heading between">
        <h2>Historial de gastos</h2>
        {onAll && (
          <button className="text-button" onClick={onAll}>
            Ver todos
            <ChevronRight size={16} />
          </button>
        )}
      </div>
      {items.length ? (
        items.map((m, i) => (
          <article className="history-row" key={m.id ?? i}>
            <span className="history-icon">
              <CategoryIcon name={m.category} size={26} />
            </span>
            <div>
              <strong>
                {m.note ||
                  (m.type === "ingreso" ? "Ingreso adicional" : m.category)}
              </strong>
              <small>
                {m.method === "manual"
                  ? "Registro manual"
                  : m.method === "ticket"
                    ? "Ticket"
                    : m.method === "audio"
                      ? "Audio"
                      : "PDF"}
              </small>
              <span className="badge">
                <CategoryIcon name={m.category} size={12} />
                {m.category}
              </span>
            </div>
            <div className="history-amount">
              <strong className={m.type === "ingreso" ? "green" : ""}>
                {m.type === "ingreso" ? "+" : ""}
                {money(m.amount)}
              </strong>
              <small>{dateLabel(m.date)}</small>
            </div>
          </article>
        ))
      ) : (
        <Empty>
          <Receipt />
          <p>
            Registra tu primer movimiento.
            <br />
            Aquí encontrarás tus gastos e ingresos.
          </p>
        </Empty>
      )}
    </section>
  );
}
export function Home({
  state,
  onRegister,
  success,
}: {
  state: State;
  onRegister: () => void;
  success: boolean;
}) {
  const [all, setAll] = useState(false);
  const [more, setMore] = useState(false);
  const [month, setMonth] = useState(state.date.slice(0, 7));
  const [items, setItems] = useState(state.movements);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { summary, forecast } = state;
  const percent = summary.budget
    ? Math.round((summary.expenses / summary.budget) * 100)
    : 0;
  const date = new Date(forecast.date + "T12:00:00");
  const year = date.getFullYear(),
    mo = date.getMonth();
  const first = new Date(year, mo, 1).getDay(),
    days = new Date(year, mo + 1, 0).getDate();
  const amounts = summary.byCategory.filter((c) => c.amount > 0);
  const shown = more
    ? summary.byCategory
    : amounts.length
      ? amounts.slice(0, 5)
      : summary.byCategory.slice(0, 5);
  async function history(m: string) {
    setMonth(m);
    setBusy(true);
    setError("");
    try {
      setItems(await call("history", { month: m }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="page home-page">
      <header className="home-title">
        <div>
          <span className="eyebrow">
            {new Date(state.date + "T12:00:00").toLocaleDateString("es-MX", {
              month: "long",
              year: "numeric",
            })}
          </span>
          <h1>Presupuesto del hogar</h1>
          <p>
            Conoce cómo van tus finanzas y recibe recomendaciones para alcanzar
            tus metas.
          </p>
        </div>
        <button className="register-button" onClick={onRegister}>
          <Plus size={20} />
          Registra
          <br />
          movimiento
        </button>
      </header>
      <section className="budget-card">
        <div
          className="donut"
          role="img"
          aria-label={`Has gastado ${money(summary.expenses)} de ${money(summary.budget)}`}
          style={{
            background: `conic-gradient(#fa4d7c 0 ${Math.min(100, percent)}%, #ffbb6d ${Math.min(100, percent)}% 100%)`,
          }}
        >
          <div>
            <strong>{money(summary.expenses)}</strong>
            <small>de {money(summary.budget)}</small>
          </div>
        </div>
        <div className="budget-legend">
          <div>
            <i />
            <span>Gastos</span>
            <strong>{money(summary.expenses)}</strong>
            <b>{percent}%</b>
          </div>
          <div>
            <i className="orange" />
            <span>Presupuesto</span>
            <strong>{money(summary.budget)}</strong>
            <b>100%</b>
          </div>
          {summary.extraIncome > 0 && (
            <div>
              <i className="green-dot" />
              <span>Ingreso extra</span>
              <strong>{money(summary.extraIncome)}</strong>
            </div>
          )}
        </div>
      </section>
      <section className="category-section">
        <div className="section-heading between">
          <h3>Gastos por categoría</h3>
          <button className="text-button" onClick={() => setMore(!more)}>
            {more ? "Ver menos" : "Ver más"}
            <ChevronRight size={14} />
          </button>
        </div>
        {shown.map((c) => {
          const i = summary.byCategory.findIndex((x) => x.name === c.name);
          const ratio = summary.expenses
            ? Math.round((c.amount / summary.expenses) * 100)
            : 0;
          return (
            <div className="category-row" key={c.name}>
              <span
                className="category-icon"
                style={{ color: colors[i], background: colors[i] + "22" }}
              >
                <CategoryIcon name={c.name} />
              </span>
              <span>{c.name}</span>
              <div className="progress">
                <i style={{ width: ratio + "%", background: colors[i] }} />
              </div>
              <strong>{money(c.amount)}</strong>
              <small style={{ color: colors[i] }}>{ratio}%</small>
            </div>
          );
        })}
        <p className="helper">Porcentaje de tus gastos registrados este mes.</p>
      </section>
      <section className="trends">
        <h2>Tendencias</h2>
        <p>Anticípate a lo que viene.</p>
        <div className="calendar-card">
          <div className="calendar-day">
            <span>{date.toLocaleDateString("es-MX", { weekday: "long" })}</span>
            <strong>{date.getDate()}</strong>
            <h3>{forecast.name}</h3>
            {forecast.extra !== null ? (
              <p>
                Podrías gastar <b>{money(forecast.extra)} más</b>.
              </p>
            ) : (
              <p>
                Aún no hay historial suficiente para calcular el gasto
                adicional.
              </p>
            )}
            <small>{forecast.source}</small>
          </div>
          <div className="calendar">
            <h4>
              {date.toLocaleDateString("es-MX", { month: "long" })} {year}
            </h4>
            <div>
              {["D", "L", "M", "M", "J", "V", "S"].map((x, i) => (
                <b key={"d" + i}>{x}</b>
              ))}
              {Array.from({ length: first }, (_, i) => (
                <span key={"b" + i} />
              ))}
              {Array.from({ length: days }, (_, i) => (
                <span
                  key={i}
                  className={i + 1 === date.getDate() ? "marked" : ""}
                >
                  {i + 1}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
      {success && (
        <p className="success">
          <CheckCircle2 />
          ¡Movimiento guardado! Se agregó a tu historial.
        </p>
      )}
      <History items={state.movements.slice(0, 8)} onAll={() => setAll(true)} />
      {all && (
        <Modal title="Todos tus movimientos" onClose={() => setAll(false)}>
          <label className="field">
            Mes
            <input
              type="month"
              value={month}
              max={state.date.slice(0, 7)}
              onChange={(e) => e.target.value && history(e.target.value)}
            />
          </label>
          <ErrorText text={error} />
          {busy ? <p>Cargando…</p> : <History items={items} />}
        </Modal>
      )}
    </main>
  );
}
