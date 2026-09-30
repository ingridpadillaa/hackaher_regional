import { BankConnect } from "./BankConnect";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Flame,
  Plus,
  Target,
  Pencil,
  Landmark,
} from "lucide-react";
import { type State, type Goal, money, dateLabel } from "./types";
import { Jami, Button, Field, Modal, ErrorText, Empty } from "./ui";
import { call, errorMessage } from "./firebase";

type SavingsPeriod = "mes" | "semana" | "día";

const DAYS_PER_YEAR = 365;
const WEEKS_PER_YEAR = 52;
const MONTHS_PER_YEAR = 12;

function monthlyEquivalent(amount: number, period: SavingsPeriod) {
  if (period === "día") return (amount * DAYS_PER_YEAR) / MONTHS_PER_YEAR;
  if (period === "semana") return (amount * WEEKS_PER_YEAR) / MONTHS_PER_YEAR;
  return amount;
}

function periodEquivalent(monthly: number, period: SavingsPeriod) {
  if (period === "día") return (monthly * MONTHS_PER_YEAR) / DAYS_PER_YEAR;
  if (period === "semana") return (monthly * MONTHS_PER_YEAR) / WEEKS_PER_YEAR;
  return monthly;
}

function addPeriods(date: string, count: number, period: SavingsPeriod) {
  const result = new Date(`${date}T12:00:00`);
  if (period === "mes") result.setMonth(result.getMonth() + count);
  else result.setDate(result.getDate() + count * (period === "semana" ? 7 : 1));
  return result.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function daysBetween(from: string, to: string) {
  const start = new Date(`${from}T12:00:00`).getTime();
  const end = new Date(`${to}T12:00:00`).getTime();
  return Math.ceil((end - start) / 86_400_000);
}

function pluralPeriod(period: SavingsPeriod, count: number) {
  if (count === 1) return period;
  return period === "mes" ? "meses" : period === "día" ? "días" : "semanas";
}

export function Simulator({
  state,
  onSaved,
}: {
  state: State;
  onSaved: () => Promise<void>;
}) {
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const activity = state.activity ?? {
    streak: 0,
    best: 0,
    monthDays: 0,
    todayStatus: "pending",
  };
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) void onSaved().catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [onSaved]);
  async function confirmNoExpense() {
    setReviewBusy(true);
    setReviewError("");
    try {
      await call("confirmNoExpense");
      await onSaved();
    } catch (e) {
      setReviewError(errorMessage(e));
      await onSaved().catch(() => {});
    } finally {
      setReviewBusy(false);
    }
  }
  const [editing, setEditing] = useState<Goal | null | undefined>();
  const [targetDate, setTargetDate] = useState("");
  const [entryGoal, setEntryGoal] = useState<Goal | null>(null);
  const [entryType, setEntryType] = useState<"contribution" | "withdrawal">(
    "contribution",
  );
  const [entryAmount, setEntryAmount] = useState("");
  const [entryDate, setEntryDate] = useState(state.date);
  const [entryNote, setEntryNote] = useState("");
  const [entryId, setEntryId] = useState("");
  function openEntry(g: Goal, type: "contribution" | "withdrawal") {
    setEntryGoal(g);
    setEntryType(type);
    setEntryAmount("");
    setEntryDate(state.date);
    setEntryNote("");
    setEntryId(crypto.randomUUID());
    setError("");
  }
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState<SavingsPeriod>("mes");
  const [selected, setSelected] = useState(state.goals[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [error, setError] = useState("");
  const goal = state.goals.find((g) => g.id === selected) ?? state.goals[0];
  const remaining = goal ? Math.max(0, goal.target - goal.saved) : 0;
  const contribution = Number(amount);
  const duration = contribution > 0 ? Math.ceil(remaining / contribution) : null;
  const contributionMonthly =
    contribution > 0 ? monthlyEquivalent(contribution, period) : 0;
  const equivalents = {
    day: periodEquivalent(contributionMonthly, "día"),
    week: periodEquivalent(contributionMonthly, "semana"),
    month: contributionMonthly,
  };
  const incomeBasis =
    state.summary.receivedIncome > 0
      ? state.summary.receivedIncome
      : state.expectedIncome;
  const availableMonthly = Math.max(0, incomeBasis - state.summary.expenses);
  const suggestedMonthly =
    incomeBasis > 0 && availableMonthly > 0
      ? Math.min(
          availableMonthly,
          Math.max(
            incomeBasis * 0.05,
            Math.min(incomeBasis * 0.2, availableMonthly * 0.5),
          ),
        )
      : 0;
  const hasFinancialData = incomeBasis > 0 || state.summary.expenses > 0;
  const exceedsAvailable =
    contributionMonthly > 0 && contributionMonthly > availableMonthly;
  const targetDays = goal?.targetDate
    ? daysBetween(state.date, goal.targetDate)
    : null;
  const targetRates =
    targetDays && targetDays > 0 && remaining > 0
      ? {
          day: remaining / targetDays,
          week: (remaining / targetDays) * 7,
          month: (remaining / targetDays) * (DAYS_PER_YEAR / MONTHS_PER_YEAR),
        }
      : null;
  function useSuggestion() {
    setAmount(periodEquivalent(suggestedMonthly, period).toFixed(2));
  }
  function edit(g: Goal | null) {
    setEditing(g);
    setName(g?.name ?? "");
    setTargetDate(g?.targetDate ?? "");
    setTarget(g ? String(g.target) : "");
    setError("");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await call("saveGoal", {
        ...(editing ? { id: editing.id } : {}),
        name,
        targetDate,
        target: Number(target),
      });
      await onSaved();
      setEditing(undefined);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page simulator-page">
      <div className="jami-message">
        <Jami kind="ahorro" />
        <div className="speech">
          <h2>¡Tú puedes!</h2>
          <p>
            Cada pequeño ahorro
            <br />
            te acerca a tus sueños <span className="pink">♥</span>
          </p>
        </div>
      </div>
      <section className="card streak-card">
        <h2>Tu racha de constancia</h2>
        <div className="streak">
          <div className="flames">
            {Array.from({ length: 5 }, (_, i) => (
              <span className={i < activity.streak ? "lit" : ""} key={i}>
                <Flame />
              </span>
            ))}
          </div>
          <div className="streak-count">
            <strong>{activity.streak}</strong>
            <small>días seguidos</small>
          </div>
        </div>
        <p className="streak-caption">
          Tu constancia cuenta, incluso en los días en que no gastas.
        </p>
        <div
          className="streak-feedback"
          aria-live="polite"
          aria-busy={reviewBusy}
        >
          {activity.todayStatus === "pending" ? (
            <>
              <p className="helper">Aún no has registrado gastos de hoy.</p>
              <Button
                className="streak-checkin"
                disabled={reviewBusy}
                onClick={confirmNoExpense}
              >
                {reviewBusy ? "Confirmando…" : "Hoy no gasté"}
              </Button>
            </>
          ) : (
            <div className="streak-complete">
              <CheckCircle2 size={22} aria-hidden="true" />
              <div>
                <strong>Hoy ya cumpliste</strong>
                <p>
                  {activity.todayStatus === "expense"
                    ? "Registraste un gasto de hoy. Tu racha se actualizó automáticamente."
                    : "Confirmaste que hoy no gastaste. ¡Tu revisión también cuenta!"}
                </p>
              </div>
            </div>
          )}
          <ErrorText text={reviewError} />
        </div>
        <p className="streak-stats">
          Mejor racha: <b>{activity.best} días</b> · Este mes:{" "}
          <b>{activity.monthDays} días</b>
        </p>
      </section>
      <div className="section-heading between goals-heading">
        <h2>Tus metas de ahorro</h2>
        <Button className="secondary" onClick={() => edit(null)}>
          <Plus size={18} />
          Crear meta
        </Button>
      </div>
      {state.goals.length ? (
        state.goals.map((g) => {
          const percent = Math.min(100, Math.round((g.saved / g.target) * 100));
          return (
            <article
              key={g.id}
              className={
                "card goal-card " + (goal?.id === g.id ? "selected-goal" : "")
              }
            >
              <button
                className="goal-art"
                aria-label={`Seleccionar ${g.name}`}
                onClick={() => setSelected(g.id)}
              >
                <Target size={50} />
              </button>
              <div>
                <span className="badge">Tu meta</span>
                <div className="section-heading between">
                  <h2>{g.name}</h2>
                  <button
                    className="icon-button"
                    aria-label={`Editar ${g.name}`}
                    onClick={() => edit(g)}
                  >
                    <Pencil size={16} />
                  </button>
                </div>
                <p>
                  <strong>{money(g.saved)}</strong> de {money(g.target)}
                </p>
                <div className="goal-progress">
                  <div className="progress">
                    <i style={{ width: percent + "%" }} />
                  </div>
                  <b>{percent}%</b>
                </div>
                <small>Faltan {money(Math.max(0, g.target - g.saved))}</small>
                {g.targetDate && (
                  <small>Fecha objetivo: {dateLabel(g.targetDate)}</small>
                )}
                <div className="saving-actions">
                  <Button
                    className="secondary"
                    onClick={() => openEntry(g, "contribution")}
                  >
                    Registrar aportación
                  </Button>
                  <Button
                    className="secondary"
                    disabled={g.saved <= 0}
                    onClick={() => openEntry(g, "withdrawal")}
                  >
                    Registrar retiro
                  </Button>
                </div>
                <details>
                  <summary>Ver aportaciones y retiros</summary>
                  {(state.savingsEntries ?? [])
                    .filter((e) => e.goalId === g.id)
                    .map((e) => (
                      <p key={e.id}>
                        {dateLabel(e.date)} ·{" "}
                        {e.type === "opening"
                          ? "Saldo previo"
                          : e.type === "withdrawal"
                            ? "Retiro"
                            : "Aportación"}
                        : {money(e.amount)}
                        {e.note ? ` · ${e.note}` : ""}
                      </p>
                    ))}
                </details>
              </div>
            </article>
          );
        })
      ) : (
        <Empty>
          <Target />
          <p>
            Crea tu primera meta.
            <br />
            Dale un nombre y elige cuánto quieres ahorrar.
          </p>
        </Empty>
      )}
      <section className="card simulation">
        <div>
          <h2>Simulador de ahorro</h2>
          <p>¿Cuánto te acerca a tu meta?</p>
          {state.goals.length > 1 && (
            <Field label="Meta">
              <select
                value={goal?.id}
                onChange={(e) => setSelected(e.target.value)}
              >
                {state.goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="simulation-input">
            <span>$</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              aria-label="Aporte para la simulación"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <select
              aria-label="Frecuencia de ahorro"
              value={period}
              onChange={(e) => setPeriod(e.target.value as SavingsPeriod)}
            >
              <option value="mes">Ahorro mensual</option>
              <option value="semana">Ahorro semanal</option>
              <option value="día">Ahorro diario</option>
            </select>
          </div>
        </div>
        <div className="simulation-result" aria-live="polite">
          {!goal ? (
            <p>Primero crea una meta.</p>
          ) : duration !== null ? (
            remaining === 0 ? (
              <p>
                Esta meta ya está completa. <b>¡Lo lograste!</b>
              </p>
            ) : (
              <div>
                <p>
                  Con {money(contribution)} por {period}, alcanzarías tu meta en
                </p>
                <b>
                  {duration} {pluralPeriod(period, duration)}
                </b>
                <small>Fecha estimada: {addPeriods(state.date, duration, period)}</small>
              </div>
            )
          ) : (
            <p>Ingresa un aporte para calcular el tiempo.</p>
          )}
        </div>
      </section>
      {goal && contribution > 0 && remaining > 0 && (
        <section className="simulation-details" aria-live="polite">
          <div className="simulation-equivalents">
            <div>
              <small>Equivale por día</small>
              <strong>{money(equivalents.day)}</strong>
            </div>
            <div>
              <small>Equivale por semana</small>
              <strong>{money(equivalents.week)}</strong>
            </div>
            <div>
              <small>Equivale por mes</small>
              <strong>{money(equivalents.month)}</strong>
            </div>
          </div>
          <div
            className={`simulation-guidance ${
              !hasFinancialData ? "neutral" : exceedsAvailable ? "warning" : "success"
            }`}
          >
            <h3>¿Cabe en tus finanzas?</h3>
            {!hasFinancialData ? (
              <p>
                Aún no hay ingresos ni gastos suficientes para evaluar esta
                aportación. El tiempo mostrado es solo una simulación matemática.
              </p>
            ) : exceedsAvailable ? (
              <p>
                Tu plan equivale a {money(contributionMonthly)} al mes y supera por{" "}
                <strong>{money(contributionMonthly - availableMonthly)}</strong> el
                disponible calculado con tus datos de este mes.
              </p>
            ) : (
              <p>
                Tu plan equivale a {money(contributionMonthly)} al mes y sí cabe en
                el disponible calculado con tus datos actuales.
              </p>
            )}
            {hasFinancialData && (
              <small>
                Ingreso {state.summary.receivedIncome > 0 ? "registrado" : "declarado"}:{" "}
                {money(incomeBasis)} · Gastos registrados: {money(state.summary.expenses)} ·
                Disponible: {money(availableMonthly)}
              </small>
            )}
            {suggestedMonthly > 0 && (
              <div className="simulation-suggestion">
                <p>
                  Aportación sugerida: <strong>{money(suggestedMonthly)} al mes</strong>
                </p>
                <button type="button" onClick={useSuggestion}>
                  Usar sugerencia
                </button>
              </div>
            )}
          </div>
          {goal.targetDate && (
            <div className="target-date-plan">
              <h3>Para llegar el {dateLabel(goal.targetDate)}</h3>
              {targetRates ? (
                <p>
                  Necesitarías ahorrar aproximadamente {money(targetRates.day)} al día, {" "}
                  {money(targetRates.week)} a la semana o {money(targetRates.month)} al mes.
                </p>
              ) : remaining === 0 ? (
                <p>Ya alcanzaste esta meta.</p>
              ) : (
                <p>La fecha objetivo ya pasó. Edita la meta para elegir una nueva fecha.</p>
              )}
            </div>
          )}
        </section>
      )}
      <p className="helper">
        La simulación usa los datos registrados del mes. No mueve dinero ni modifica
        tus aportaciones.
      </p>
      <div className="encouragement">
        <div>
          <h3>Vas muy bien</h3>
          <p>Cada revisión te ayuda a conocer mejor tu dinero.</p>
        </div>
      </div>
      <section className="card">
        <div className="section-heading">
          <Landmark className="pink" />
          <div>
            <h3>Mi conexión bancaria</h3>
            <small>
              {state.bank.lastSync
                ? `Última sincronización: ${state.bank.lastSync}`
                : "Todavía no hay una conexión bancaria activa."}
            </small>
          </div>
        </div>
        <Button className="secondary" onClick={() => setBankOpen(true)}>
          Conectar mi banco
        </Button>
        <ErrorText text={error} />
      </section>
      {bankOpen && (
        <BankConnect onClose={() => setBankOpen(false)} onSaved={onSaved} />
      )}
      {entryGoal && (
        <Modal
          title={
            entryType === "contribution"
              ? "Registrar aportación"
              : "Registrar retiro"
          }
          onClose={() => !busy && setEntryGoal(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await call("saveSavingsEntry", {
                  requestId: entryId,
                  goalId: entryGoal.id,
                  type: entryType,
                  amount: Number(entryAmount),
                  date: entryDate,
                  note: entryNote,
                });
                await onSaved();
                setEntryGoal(null);
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              {entryGoal.name} · {money(entryGoal.saved)} registrados.
            </p>
            <Field label="Monto (MXN)">
              <input
                required
                type="number"
                min="0.01"
                max={entryType === "withdrawal" ? entryGoal.saved : 10000000}
                step="0.01"
                value={entryAmount}
                onChange={(e) => setEntryAmount(e.target.value)}
              />
            </Field>
            <Field label="Fecha">
              <input
                required
                type="date"
                max={state.date}
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </Field>
            <Field label="Nota (opcional)">
              <input
                maxLength={400}
                value={entryNote}
                onChange={(e) => setEntryNote(e.target.value)}
              />
            </Field>
            <p className="helper">
              Registra dinero que ya apartaste o retiraste. Esto no mueve dinero
              ni genera ingresos o gastos adicionales.
            </p>
            <ErrorText text={error} />
            <Button busy={busy}>Confirmar registro</Button>
          </form>
        </Modal>
      )}
      {editing !== undefined && (
        <Modal
          title={editing ? "Editar meta" : "Crear meta"}
          onClose={() => setEditing(undefined)}
        >
          <form onSubmit={save}>
            <Field label="Título de tu meta">
              <input
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="¿Qué sueño quieres cumplir?"
              />
            </Field>
            <Field label="¿Cuánto quieres ahorrar? (MXN)">
              <input
                type="number"
                required
                min="0.01"
                max="10000000"
                step="0.01"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </Field>
            <Field label="Fecha objetivo (opcional)">
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </Field>
            <ErrorText text={error} />
            <Button busy={busy}>
              {editing ? "Guardar cambios" : "Crear meta"}
            </Button>
          </form>
        </Modal>
      )}
    </main>
  );
}
