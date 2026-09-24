import { useEffect, useRef, useState } from "react";
import { call, errorMessage } from "./firebase";
import { Modal, ErrorText, Button, Field } from "./ui";
import { categories, money } from "./types";
export function BankConnect({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"live" | "sandbox">("live");
  const [availability, setAvailability] = useState<any>(null),
    [connection, setConnection] = useState<any>(null);
  const [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Verificando disponibilidad de BBVA…");
  const [accounts, setAccounts] = useState<any[]>([]),
    [accountId, setAccountId] = useState(""),
    [preview, setPreview] = useState<any>(null),
    [choices, setChoices] = useState<Record<string, any>>({});
  const [confirmDelete, setConfirmDelete] = useState(false),
    [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const widget = useRef<any>(null),
    live = useRef(true);
  useEffect(() => {
    live.current = true;
    call("bankAvailability")
      .then((r) => {
        if (live.current) {
          setAvailability(r);
          setStatus("Selecciona el entorno y revisa el consentimiento.");
        }
      })
      .catch((e) => live.current && setError(errorMessage(e)));
    return () => {
      live.current = false;
      widget.current?.close();
    };
  }, []);
  useEffect(() => {
    setConnection(null);
    setAccepted(false);
    setAccounts([]);
    setPreview(null);
    setAccountId("");
    setError("");
    setConfirmDelete(false);
    setConfirmDisconnect(false);
    widget.current?.close();
    let active = true;
    call("bankConnectionStatus", { mode })
      .then((r) => active && setConnection(r))
      .catch((e) => active && setError(errorMessage(e)));
    return () => {
      active = false;
      void call("bankDiscardReview", { mode }).catch(() => {});
    };
  }, [mode]);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      if (live.current) setError(errorMessage(e));
    } finally {
      if (live.current) setBusy(false);
    }
  }
  async function refreshAccounts() {
    const result = await call("bankAccounts", { mode });
    if (!live.current || modeRef.current !== mode) return;
    setAccounts(result);
    setPreview(null);
    setStatus(
      result.length
        ? "Selecciona la cuenta que quieres revisar."
        : "Syncfy todavía no devuelve cuentas MXN de BBVA. Completa la autorización o espera a que termine la sincronización.",
    );
    setConnection(await call("bankConnectionStatus", { mode }));
  }
  async function connect() {
    await run(async () => {
      const session = await call(
        connection?.consented ? "bankConnect" : "bankAuthorize",
        { mode, accept: accepted },
      );
      if (!live.current || modeRef.current !== mode) return;
      (window as any).global ??= window;
      const { default: SyncfyWidget } =
        await import("@syncfy/authentication-widget");
      await import("@syncfy/authentication-widget/dist/syncfy-authentication-widget.css");
      if (!live.current || modeRef.current !== mode) return;
      widget.current?.close();
      const w = new SyncfyWidget({
        token: session.token,
        element: "#syncfy-widget",
        enableTestMode: session.sandbox,
        config: {
          locale: "es",
          entrypoint: { country: "MX", site: session.siteId },
          navigation: { requireConsent: true },
        },
        refreshTokenFunction: () => call("bankConnect", { mode }),
      });
      widget.current = w;
      w.on("success", () => {
        if (live.current && modeRef.current === mode) void run(refreshAccounts);
      });
      w.on(
        "error",
        () =>
          live.current &&
          setError(
            "Syncfy no pudo completar la conexión. Revisa el mensaje del proveedor; no repitas códigos bancarios aquí.",
          ),
      );
      w.on(
        "401",
        () =>
          live.current &&
          setError("La sesión de Syncfy venció. Abre de nuevo la conexión."),
      );
      w.setEntrypointSite(session.siteId);
      w.open();
      setConnection({ ...connection, consented: true });
      setStatus(
        session.sandbox
          ? "Solo datos de prueba: no introduzcas credenciales BBVA reales."
          : "Completa la autorización únicamente en el formulario de Syncfy.",
      );
    });
  }
  async function consult(skip = 0) {
    await run(async () => {
      const p = await call("bankPreview", { mode, accountId, skip });
      if (live.current) {
        setPreview(p);
        setChoices({});
        setStatus("Revisa cada movimiento antes de importarlo.");
      }
    });
  }
  const selected = Object.entries(choices).filter(([, c]) => c.selected);
  const unavailable = mode === "live" && !availability?.liveEnabled;
  return (
    <Modal
      title="Conectar y gestionar mi banco"
      onClose={() => !busy && onClose()}
    >
      <Field label="Entorno bancario">
        <select
          value={mode}
          disabled={busy}
          onChange={(e) => setMode(e.target.value as any)}
        >
          <option value="live">Mi cuenta real BBVA</option>
          <option value="sandbox">Prueba con datos ficticios</option>
        </select>
      </Field>
      <span className="badge">
        {mode === "live"
          ? "Consulta bancaria personal"
          : "Sandbox · Datos ficticios"}
      </span>
      {unavailable && availability && (
        <p role="alert">
          La integración actual no tiene BBVA real habilitado. No introduzcas tu
          tarjeta, contraseña o token en el entorno de prueba. Falta habilitar
          producción con Syncfy.
        </p>
      )}
      <p className="helper">
        Syncfy puede consultar las cuentas y movimientos disponibles en tu
        banca. Tú eliges cuáles importar a Summa. Summa no realiza pagos ni
        transferencias y no guarda tu contraseña bancaria. Los movimientos
        importados serán privados para tu usuario; no se enviarán a Gemini desde
        este flujo. La conexión no acredita ahorro automáticamente.
      </p>
      <p className="helper">
        Las credenciales se introducen en el componente de Syncfy. Sus
        condiciones y tratamiento de datos se muestran durante la autorización.
        Summa guarda una revisión cifrada durante el proceso, válida por cinco
        minutos, y guarda los movimientos que confirmes en tu historial privado.
        Los borradores vencidos quedan pendientes de eliminación automática.
      </p>
      <label className="check-line">
        <input
          type="checkbox"
          checked={accepted}
          disabled={busy}
          onChange={(e) => setAccepted(e.target.checked)}
        />
        <span>
          Autorizo a Syncfy a consultar mi información bancaria para revisarla
          en Summa. Entiendo que puedo desconectar el vínculo y borrar los
          movimientos importados.
        </span>
      </label>
      <Button
        disabled={busy || !accepted || unavailable || !availability}
        onClick={connect}
      >
        {connection?.consented
          ? "Abrir conexión de nuevo"
          : "Autorizar y abrir Syncfy"}
      </Button>
      <div id="syncfy-widget" />
      <p role="status">{status}</p>
      <ErrorText text={error} />
      {connection?.consented && (
        <Button
          className="secondary"
          disabled={busy}
          onClick={() => run(refreshAccounts)}
        >
          Consultar cuentas disponibles
        </Button>
      )}
      {accounts.length > 0 && (
        <>
          <Field label="Cuenta a revisar">
            <select
              value={accountId}
              disabled={busy}
              onChange={(e) => {
                setAccountId(e.target.value);
                setPreview(null);
                setChoices({});
              }}
            >
              <option value="">Selecciona tu cuenta</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.type} · terminación {a.last4}
                </option>
              ))}
            </select>
          </Field>
          <Button disabled={busy || !accountId} onClick={() => consult()}>
            Revisar últimos 30 días
          </Button>
        </>
      )}
      {preview && (
        <section aria-label="Revisión bancaria">
          <p>
            {preview.from} a {preview.to}. Solo movimientos confirmados en MXN.{" "}
            {preview.skipped > 0 &&
              `${preview.skipped} registros se omitieron por estar pendientes, fuera del periodo o incompletos.`}
          </p>
          <p className="helper">
            Elige gasto, ingreso o transferencia entre tus cuentas. En tarjetas
            de crédito, el pago de la tarjeta no es un ingreso nuevo; revisa
            también devoluciones. Los importes son movimientos, no saldo
            disponible.
          </p>
          {!preview.rows.length && (
            <p>No hay movimientos válidos en esta página.</p>
          )}
          {preview.rows.map((r: any) => {
            const c = choices[r.id] ?? {
              selected: false,
              type: "",
              category: "Otros",
              incomeKind: "extra",
              allowDuplicate: false,
            };
            const change = (next: any) =>
              setChoices((s) => ({ ...s, [r.id]: { ...c, ...next } }));
            return (
              <div className="bank-review-row" key={r.id}>
                <label className="check-line">
                  <input
                    type="checkbox"
                    disabled={busy || r.imported}
                    checked={c.selected}
                    onChange={(e) => change({ selected: e.target.checked })}
                  />
                  <span>
                    {r.date} · {r.description || "Sin descripción"} ·{" "}
                    {money(r.amount)} · {r.direction}
                    {r.imported ? " · Ya importado" : ""}
                  </span>
                </label>
                {r.possibleDuplicate && !r.imported && (
                  <p>
                    Hay un registro con la misma fecha e importe. Comprueba que
                    no lo capturaste manualmente.
                  </p>
                )}
                {c.selected && (
                  <>
                    <Field label="Cómo contar este movimiento">
                      <select
                        value={c.type}
                        onChange={(e) => change({ type: e.target.value })}
                      >
                        <option value="">Selecciona el tipo</option>
                        <option value="gasto">Gasto</option>
                        <option value="ingreso">Ingreso</option>
                        <option value="transferencia">
                          Transferencia entre mis cuentas
                        </option>
                      </select>
                    </Field>
                    <Field label="Categoría">
                      <select
                        value={c.category}
                        onChange={(e) => change({ category: e.target.value })}
                      >
                        {categories.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </Field>
                    {c.type === "ingreso" && (
                      <Field label="Tipo de ingreso">
                        <select
                          value={c.incomeKind}
                          onChange={(e) =>
                            change({ incomeKind: e.target.value })
                          }
                        >
                          <option value="extra">Extra</option>
                          <option value="regular">Habitual</option>
                        </select>
                      </Field>
                    )}
                    {r.possibleDuplicate && (
                      <label className="check-line">
                        <input
                          type="checkbox"
                          checked={c.allowDuplicate}
                          onChange={(e) =>
                            change({ allowDuplicate: e.target.checked })
                          }
                        />
                        <span>
                          Revisé la coincidencia y quiero importar este
                          movimiento.
                        </span>
                      </label>
                    )}
                  </>
                )}
              </div>
            );
          })}
          <Button
            disabled={
              busy || !selected.length || selected.some(([, c]) => !c.type)
            }
            onClick={() =>
              run(async () => {
                const r = await call("bankImport", {
                  mode,
                  draftId: preview.draftId,
                  items: selected.map(([id, c]) => ({
                    id,
                    type: c.type,
                    category: c.category,
                    incomeKind: c.incomeKind,
                    allowDuplicate: c.allowDuplicate,
                  })),
                });
                setStatus(
                  `${r.imported} movimientos privados importados; ${r.alreadyImported} ya existían.`,
                );
                setPreview(null);
                setChoices({});
                await onSaved();
              })
            }
          >
            Importar selección de forma privada
          </Button>
          {preview.hasMore && (
            <Button
              className="secondary"
              disabled={busy}
              onClick={() => consult(preview.nextSkip)}
            >
              Ver siguiente página (descarta esta selección)
            </Button>
          )}
        </section>
      )}
      <hr />
      <label className="check-line">
        <input
          type="checkbox"
          checked={confirmDisconnect}
          onChange={(e) => setConfirmDisconnect(e.target.checked)}
        />
        <span>
          Quiero revocar la conexión con Syncfy. Se conservarán los movimientos
          ya importados.
        </span>
      </label>
      <Button
        className="secondary"
        disabled={busy || !confirmDisconnect}
        onClick={() =>
          run(async () => {
            await call("bankDisconnect", { mode });
            widget.current?.close();
            setConnection(null);
            setPreview(null);
            setAccounts([]);
            setAccepted(false);
            setStatus("Conexión revocada en Syncfy.");
            await onSaved();
          })
        }
      >
        Desconectar mi banco
      </Button>
      <label className="check-line">
        <input
          type="checkbox"
          checked={confirmDelete}
          onChange={(e) => setConfirmDelete(e.target.checked)}
        />
        <span>
          Quiero borrar mis movimientos importados de este entorno en el hogar
          actual. Los reportes se recalcularán.
        </span>
      </label>
      <Button
        className="secondary"
        disabled={busy || !confirmDelete}
        onClick={() =>
          run(async () => {
            const r = await call("bankEraseImports", { mode });
            setPreview(null);
            setChoices({});
            setStatus(
              `${r.deleted} movimientos bancarios borrados de este hogar.`,
            );
            setConfirmDelete(false);
            await onSaved();
          })
        }
      >
        Borrar mis movimientos importados
      </Button>
    </Modal>
  );
}
