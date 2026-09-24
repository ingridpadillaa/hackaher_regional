import { useEffect, useState } from "react";
import { Plus, Receipt, CheckCircle2 } from "lucide-react";
import { type State, type Movement, money, dateLabel } from "./types";
import { CategoryIcon, Empty, Modal, ErrorText } from "./ui";
import { Agenda } from "./Agenda";
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
        <h2>Historial de movimientos</h2>
        {onAll && (
          <button className="text-button" onClick={onAll}>
            Ver todos
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
  onSaved,
  success,
}: {
  state: State;
  onRegister: () => void;
  onSaved: () => Promise<void>;
  success: boolean;
}) {
  const [month, setMonth] = useState(state.date.slice(0, 7));
  const [report, setReport] = useState({
    month: state.date.slice(0, 7),
    movements: state.movements,
    summary: state.summary,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [all, setAll] = useState(false);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    call<typeof report>("report", { month })
      .then((r) => {
        if (active) setReport(r);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [month, state]);
  const summary = report.summary;
  const max = Math.max(summary.receivedIncome, summary.expenses, 1);
  return (
    <main className="page home-page">
      <header className="home-title">
        <div>
          <span className="eyebrow">TU HOGAR, AL DÍA</span>
          <h1>Tu dinero, más claro</h1>
          <p>Revisa tus movimientos y organiza lo que viene.</p>
        </div>
        <button className="register-button" onClick={onRegister}>
          <Plus size={20} />
          Registrar movimiento
        </button>
      </header>
      {success && (
        <p className="success" role="status">
          <CheckCircle2 />
          Movimiento guardado.
        </p>
      )}
      <section className="card monthly-report">
        <div className="section-heading between">
          <div>
            <h2>Reporte mensual</h2>
            <p>Solo movimientos recibidos y registrados.</p>
          </div>
          <label className="field">
            Mes del reporte
            <input
              type="month"
              value={month}
              max={state.date.slice(0, 7)}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
            />
          </label>
        </div>
        <ErrorText text={error} />
        {busy ? (
          <p role="status">Actualizando reporte…</p>
        ) : error ? (
          <p>
            El reporte no pudo actualizarse. Intenta seleccionar el mes otra
            vez.
          </p>
        ) : (
          <>
            <div
              className="report-bars"
              role="img"
              aria-label={`Ingresos recibidos ${money(summary.receivedIncome)}: habituales ${money(summary.regularIncome)}, adicionales ${money(summary.extraIncome)}. Gastos ${money(summary.expenses)}.`}
            >
              <div>
                <span>Ingresos recibidos</span>
                <strong>{money(summary.receivedIncome)}</strong>
                <div className="report-track">
                  <i
                    className="regular"
                    style={{ width: `${(summary.regularIncome / max) * 100}%` }}
                  />
                  <i
                    className="extra"
                    style={{ width: `${(summary.extraIncome / max) * 100}%` }}
                  />
                </div>
                <small>
                  Habituales: {money(summary.regularIncome)} · Adicionales:{" "}
                  {money(summary.extraIncome)}
                </small>
              </div>
              <div>
                <span>Gastos registrados</span>
                <strong>{money(summary.expenses)}</strong>
                <div className="report-track">
                  <i
                    className="expense"
                    style={{ width: `${(summary.expenses / max) * 100}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="report-balance">
              <span>Balance de movimientos</span>
              <strong>{money(summary.balance)}</strong>
            </div>
            <p className="helper">
              Ingresos recibidos menos gastos. Las transferencias y aportaciones
              a metas no son ingresos nuevos. Este balance no representa un
              saldo bancario.
            </p>
            <h3>Gastos por categoría</h3>
            {summary.byCategory
              .filter((c) => c.amount > 0)
              .map((c, i) => (
                <div className="category-row" key={c.name}>
                  <span
                    className="category-icon"
                    style={{ color: colors[i % colors.length] }}
                  >
                    <CategoryIcon name={c.name} />
                  </span>
                  <span>{c.name}</span>
                  <div className="progress">
                    <i
                      style={{
                        width: `${summary.expenses ? (c.amount / summary.expenses) * 100 : 0}%`,
                        background: colors[i % colors.length],
                      }}
                    />
                  </div>
                  <strong>{money(c.amount)}</strong>
                </div>
              ))}
            {summary.expenses === 0 && (
              <p className="helper">No hay gastos registrados en este mes.</p>
            )}
            <History
              items={report.movements.slice(0, 8)}
              onAll={() => setAll(true)}
            />
          </>
        )}
      </section>
      <Agenda state={state} onSaved={onSaved} />
      {all && (
        <Modal
          title="Movimientos del mes seleccionado"
          onClose={() => setAll(false)}
        >
          <History items={report.movements} />
        </Modal>
      )}
    </main>
  );
}
