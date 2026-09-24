import { BankConnect } from "./BankConnect";
import { useState } from "react";
import {
  Flame,
  Plus,
  Target,
  Pencil,
  TrendingUp,
  Landmark,
} from "lucide-react";
import { type State, type Goal, money } from "./types";
import { Logo, Jami, Button, Field, Modal, ErrorText, Empty } from "./ui";
import { call, errorMessage } from "./firebase";
export function Simulator({
  state,
  onSaved,
}: {
  state: State;
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Goal | null | undefined>();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState("mes");
  const [selected, setSelected] = useState(state.goals[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [error, setError] = useState("");
  const goal = state.goals.find((g) => g.id === selected) ?? state.goals[0];
  const remaining = goal ? Math.max(0, goal.target - goal.saved) : 0;
  const duration =
    Number(amount) > 0 ? Math.ceil(remaining / Number(amount)) : null;
  function edit(g: Goal | null) {
    setEditing(g);
    setName(g?.name ?? "");
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
      <Logo />
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
        <h2>Tu racha de ahorro</h2>
        <div className="streak">
          <div className="flames">
            {Array.from({ length: 5 }, (_, i) => (
              <span className={i < state.bank.streak ? "lit" : ""} key={i}>
                <Flame />
              </span>
            ))}
          </div>
          <div className="streak-count">
            <strong>{state.bank.streak}</strong>
            <small>días seguidos</small>
          </div>
        </div>
        {!state.bank.connected && (
          <p className="helper">
            Conecta tu banco para verificar tu ahorro diario y empezar tu racha.
          </p>
        )}
        <Button onClick={() => edit(null)}>
          <Plus />
          Crear meta
        </Button>
      </section>
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
              onChange={(e) => setPeriod(e.target.value)}
            >
              <option value="mes">Ahorro mensual</option>
              <option value="semana">Ahorro semanal</option>
              <option value="día">Ahorro diario</option>
            </select>
          </div>
        </div>
        <div className="simulation-result" aria-live="polite">
          <TrendingUp />
          {!goal ? (
            <p>Primero crea una meta.</p>
          ) : duration !== null ? (
            <p>
              Con {money(Number(amount))} por {period}, tu meta se alcanzaría en{" "}
              <b>
                {duration}{" "}
                {duration === 1
                  ? period
                  : period === "mes"
                    ? "meses"
                    : period === "día"
                      ? "días"
                      : "semanas"}
              </b>
            </p>
          ) : (
            <p>Ingresa un aporte para calcular el tiempo.</p>
          )}
        </div>
      </section>
      <p className="helper">
        La simulación no mueve dinero ni modifica tu ahorro verificado.
      </p>
      <div className="encouragement">
        <Jami kind="avatar" />
        <div>
          <h3>¡Vas muy bien!</h3>
          <p>
            Mantén tu racha y pronto estarás más cerca de tu meta.{" "}
            <span className="pink">♥</span>
          </p>
        </div>
      </div>
      <section className="card">
        {state.bank.sandboxConnected && (
          <p className="helper">
            Conexión de prueba activa: {state.bank.sandboxAccountCount} cuentas
            y {state.bank.sandboxTransactionCount} movimientos. Estos datos no
            cuentan como ahorro real.
          </p>
        )}
        <div className="section-heading">
          <Landmark className="pink" />
          <div>
            <h3>Ahorro verificado</h3>
            {state.bank.sandbox && (
              <span className="badge">Sandbox · Datos de prueba</span>
            )}
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
