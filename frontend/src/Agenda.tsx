import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  type State,
  type Schedule,
  money,
  dateLabel,
  categories,
} from "./types";
import { Button, Modal, Field, ErrorText } from "./ui";
import { call, errorMessage } from "./firebase";
export function Agenda({
  state,
  onSaved,
}: {
  state: State;
  onSaved: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const [month, setMonth] = useState(state.date.slice(0, 7));
  const [selected, setSelected] = useState(state.date);
  const [editing, setEditing] = useState<Partial<Schedule> | null>(null);
  const [confirm, setConfirm] = useState<Schedule | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const year = Number(month.slice(0, 4)),
    mo = Number(month.slice(5)) - 1;
  const first = (new Date(year, mo, 1).getDay() + 6) % 7,
    days = new Date(year, mo + 1, 0).getDate();
  const events = (state.schedules ?? []).filter((e) => e.active);
  const dates = new Set([
    ...events.map((e) => e.nextDate),
    ...state.goals.map((g) => g.targetDate).filter(Boolean),
  ]);
  const daily = events.filter((e) => e.nextDate === selected),
    overdue = events.filter((e) => e.nextDate < state.date);
  const labels = { income: "Cobro", payment: "Pago", saving: "Aportación" };
  function shift(delta: number) {
    const d = new Date(year, mo + delta, 1, 12);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setMonth(m);
    setSelected(m + "-01");
  }
  async function run(action: string, payload: unknown) {
    setBusy(true);
    setError("");
    try {
      await call(action, payload);
      await onSaved();
      setEditing(null);
      setConfirm(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const eventRow = (e: Schedule) => (
    <article className="agenda-event" key={e.id}>
      <div>
        <span className="badge">{labels[e.kind]}</span>
        <strong>{e.title}</strong>
        <small>
          {dateLabel(e.nextDate)} · {money(e.amount)}
        </small>
      </div>
      <div className="agenda-actions">
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setError("");
            setEditing(e);
          }}
        >
          Editar
        </button>
        <button
          className="text-button"
          disabled={busy || e.nextDate > state.date}
          onClick={() => {
            setError("");
            setConfirm(e);
          }}
        >
          Registrar{" "}
          {e.kind === "income"
            ? "cobro"
            : e.kind === "payment"
              ? "pago"
              : "aportación"}
        </button>
      </div>
    </article>
  );
  return (
    <section className="card financial-agenda">
      <div className="section-heading between">
        <div>
          <span className="eyebrow">PRÓXIMOS COMPROMISOS</span>
          <h2>Agenda del hogar</h2>
        </div>
        <Button
          className="secondary"
          onClick={() => {
            setError("");
            setEditing({
              title: "",
              kind: "payment",
              amount: 0,
              nextDate: state.date,
              frequency: "monthly",
              category: "Servicios",
            });
          }}
        >
          Agregar evento
        </Button>
      </div>
      <p>
        Programa cobros, pagos y aportaciones. Confírmalos cuando ocurran para
        registrarlos una sola vez.
      </p>
      <div className="agenda-layout">
        <div>
          <div className="month-navigation">
            <button aria-label="Mes anterior" onClick={() => shift(-1)}>
              ‹
            </button>
            <strong>
              {new Date(year, mo, 1).toLocaleDateString("es-MX", {
                month: "long",
                year: "numeric",
              })}
            </strong>
            <button aria-label="Mes siguiente" onClick={() => shift(1)}>
              ›
            </button>
          </div>
          <div className="agenda-grid">
            {["L", "M", "M", "J", "V", "S", "D"].map((x, i) => (
              <span key={"w" + i}>{x}</span>
            ))}
            {Array.from({ length: first }, (_, i) => (
              <span key={"b" + i} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const d = month + "-" + String(i + 1).padStart(2, "0");
              return (
                <button
                  key={d}
                  aria-label={`${dateLabel(d)}${dates.has(d) ? ", con eventos" : ""}`}
                  aria-pressed={selected === d}
                  className={`${selected === d ? "selected" : ""} ${d === state.date ? "today" : ""}`}
                  onClick={() => setSelected(d)}
                >
                  {i + 1}
                  {dates.has(d) && <i />}
                </button>
              );
            })}
          </div>
          <small>
            ● Evento programado · La agenda muestra la próxima fecha de cada
            recurrencia.
          </small>
        </div>
        <div>
          <h3>{dateLabel(selected)}</h3>
          {daily.map(eventRow)}
          {state.goals
            .filter((g) => g.targetDate === selected)
            .map((g) => (
              <article className="agenda-event" key={g.id}>
                <div>
                  <strong>Fecha objetivo: {g.name}</strong>
                  <small>
                    {money(g.saved)} de {money(g.target)}
                  </small>
                </div>
                <button
                  className="text-button"
                  onClick={() => navigate("/simulador")}
                >
                  Ver meta
                </button>
              </article>
            ))}
          {!daily.length &&
            !state.goals.some((g) => g.targetDate === selected) && (
              <p className="helper">Sin compromisos para este día.</p>
            )}
        </div>
      </div>
      {overdue.length > 0 && (
        <div>
          <h3>Pendientes de confirmar</h3>
          {overdue.filter((e) => e.nextDate !== selected).map(eventRow)}
        </div>
      )}
      <details>
        <summary>Temporada próxima: {state.forecast.name}</summary>
        <p>
          {dateLabel(state.forecast.date)}.{" "}
          {state.forecast.extra === null
            ? "Sin historial comparable para estimar gastos adicionales."
            : `Estimación adicional: ${money(state.forecast.extra)}.`}
        </p>
      </details>
      <ErrorText text={error} />
      {editing && (
        <Modal
          title={editing.id ? "Editar evento" : "Nuevo evento"}
          onClose={() => !busy && setEditing(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run("saveSchedule", editing);
            }}
          >
            <Field label="Nombre">
              <input
                required
                maxLength={120}
                value={editing.title}
                onChange={(e) =>
                  setEditing({ ...editing, title: e.target.value })
                }
              />
            </Field>
            <Field label="Tipo">
              <select
                value={editing.kind}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    kind: e.target.value as Schedule["kind"],
                  })
                }
              >
                <option value="payment">Pago</option>
                <option value="income">Cobro de ingreso habitual</option>
                <option value="saving">Aportación a una meta</option>
              </select>
            </Field>
            <Field label="Monto (MXN)">
              <input
                required
                type="number"
                min="0.01"
                max="10000000"
                step="0.01"
                value={editing.amount || ""}
                onChange={(e) =>
                  setEditing({ ...editing, amount: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Próxima fecha">
              <input
                required
                type="date"
                value={editing.nextDate}
                onChange={(e) =>
                  setEditing({ ...editing, nextDate: e.target.value })
                }
              />
            </Field>
            <Field label="Repetición">
              <select
                value={editing.frequency}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    frequency: e.target.value as Schedule["frequency"],
                  })
                }
              >
                <option value="once">Una vez</option>
                <option value="weekly">Cada semana</option>
                <option value="biweekly">Cada 14 días</option>
                <option value="monthly">Cada mes</option>
              </select>
            </Field>
            {editing.kind === "saving" ? (
              <Field label="Meta">
                <select
                  required
                  value={editing.goalId ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, goalId: e.target.value })
                  }
                >
                  <option value="">Elige una meta</option>
                  {state.goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : editing.kind === "payment" ? (
              <Field label="Categoría">
                <select
                  value={editing.category}
                  onChange={(e) =>
                    setEditing({ ...editing, category: e.target.value })
                  }
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
            ) : null}
            <ErrorText text={error} />
            <Button busy={busy}>Guardar evento</Button>
            {editing.id && (
              <Button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => run("cancelSchedule", { id: editing.id })}
              >
                Cancelar próximos recordatorios
              </Button>
            )}
          </form>
        </Modal>
      )}
      {confirm && (
        <Modal
          title="Confirmar registro"
          onClose={() => !busy && setConfirm(null)}
        >
          <p>
            Registrar {money(confirm.amount)} de «{confirm.title}» con fecha de
            hoy. Confirma solo si ya ocurrió y aún no lo registraste por otro
            método.
          </p>
          <p className="helper">
            {confirm.kind === "saving"
              ? "Ahorro declarado por ti. No mueve dinero ni acredita verificación bancaria."
              : "Se agregará al historial y al reporte de este mes."}
          </p>
          <ErrorText text={error} />
          <Button
            busy={busy}
            onClick={() =>
              run("completeSchedule", {
                id: confirm.id,
                date: confirm.nextDate,
                actualDate: state.date,
              })
            }
          >
            Confirmar y registrar
          </Button>
        </Modal>
      )}
    </section>
  );
}
