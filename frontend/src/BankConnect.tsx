import { useEffect, useRef, useState } from "react";
import { call, errorMessage } from "./firebase";
import { Modal, ErrorText, Button } from "./ui";
export function BankConnect({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Preparando conexión segura…");
  const widget = useRef<any>(null);
  const [synced, setSynced] = useState(false);
  async function sync() {
    setStatus("Comprobando conexión…");
    setError("");
    try {
      const result = await call("syncBank");
      setStatus(
        result.connected
          ? `Conexión de prueba lista: ${result.accountCount} cuentas y ${result.transactionCount} movimientos de sandbox.`
          : "Todavía no hay cuentas conectadas. Completa el proceso en Syncfy.",
      );
      setSynced(result.connected);
      await onSaved();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    let stopped = false;
    async function start() {
      try {
        const session = await call("connectBank");
        if (stopped) return;
        (window as any).global ??= window;
        const { default: SyncfyWidget } =
          await import("@syncfy/authentication-widget");
        await import("@syncfy/authentication-widget/dist/syncfy-authentication-widget.css");
        if (stopped) return;
        const w = new SyncfyWidget({
          token: session.token,
          element: "#syncfy-widget",
          enableTestMode: true,
          config: {
            locale: "es",
            entrypoint: { country: "MX" },
            navigation: { requireConsent: true },
          },
          refreshTokenFunction: () => call("connectBank"),
        });
        widget.current = w;
        w.on("success", () => {
          if (!stopped) void sync();
        });
        w.on("error", () =>
          setError("No se pudo conectar esta institución. Intenta nuevamente."),
        );
        w.on("401", () =>
          setError("La sesión caducó. Cierra esta ventana e intenta de nuevo."),
        );
        w.open();
        setStatus("Conecta una institución de prueba desde Syncfy.");
      } catch (e) {
        if (!stopped) setError(errorMessage(e));
      }
    }
    void start();
    return () => {
      stopped = true;
      widget.current?.close();
      document.getElementById("syncfy-widget")?.replaceChildren();
    };
  }, []);
  return (
    <Modal title="Conectar con Syncfy" onClose={onClose}>
      <span className="badge">Sandbox · Datos de prueba</span>
      <p className="helper">
        Este entorno no conecta cuentas reales. Los datos de prueba no alteran
        tu presupuesto, metas ni racha real.
      </p>
      <p role="status">{status}</p>
      <ErrorText text={error} />
      <div id="syncfy-widget" />
      <Button className="secondary" onClick={sync}>
        Comprobar conexión
      </Button>
      {synced && <Button onClick={onClose}>Volver a mi simulador</Button>}
    </Modal>
  );
}
