import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { Send, X, MessageCircle } from "lucide-react";
import { auth, call, errorMessage } from "./firebase";
import { Jami } from "./ui";
type Answer = { reply: string; route?: string; mode?: string; notice?: string };
type Entry = Answer & { role: "user" | "assistant" };
const welcome: Entry = {
  role: "assistant",
  reply:
    "¡Hola! Soy Jami. Te ayudo a entender tus registros, usar el carrito y planear tus metas. ¿Qué necesitas?",
  notice: "No compartas contraseñas ni números de cuenta.",
};
const routes: Record<string, string> = {
  "/": "Abrir Inicio",
  "/carrito": "Abrir Carrito",
  "/simulador": "Abrir Simulador",
  "/perfil": "Abrir Perfil",
};
export function JamiChat() {
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState<Element>(document.body);
  useEffect(() => {
    const sync = () => {
      const dialogs = document.querySelectorAll("dialog[open]");
      setContainer(dialogs.item(dialogs.length - 1) ?? document.body);
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    sync();
    return () => observer.disconnect();
  }, []);
  const [messages, setMessages] = useState<Entry[]>([welcome]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const identity = useRef<string | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(
    () =>
      onAuthStateChanged(auth, (user) => {
        identity.current = user?.uid ?? null;
        setUid(identity.current);
        setMessages([welcome]);
        setInput("");
        setBusy(false);
      }),
    [],
  );
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages, busy, open]);
  async function send(message: string) {
    if (busy || !message.trim()) return;
    const requestUid = uid;
    setInput("");
    setMessages((current) => [
      ...current.slice(-18),
      { role: "user", reply: message },
    ]);
    setBusy(true);
    try {
      const result = uid
        ? await call<Answer>("chat", { message })
        : {
            reply:
              "Crea tu cuenta o inicia sesión. Después agrega tu hogar y sus integrantes, completa la personalización y podrás consultar tus gastos, carrito y metas.",
            notice: "Guía de uso · sin IA",
          };
      if (identity.current === requestUid)
        setMessages((current) => [
          ...current,
          { role: "assistant", ...result },
        ]);
    } catch (e) {
      if (identity.current === requestUid)
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            reply: errorMessage(e),
            notice: "Puedes volver a intentarlo.",
          },
        ]);
    } finally {
      if (identity.current === requestUid) setBusy(false);
    }
  }
  return createPortal(
    <>
      <button
        className="jami-bubble"
        aria-label={open ? "Cerrar chat de Jami" : "Abrir chat de Jami"}
        aria-expanded={open}
        aria-controls="jami-chat"
        onClick={() => setOpen(!open)}
      >
        {open ? <X /> : <Jami kind="avatar" />}
        <span>Jami</span>
      </button>
      {open && (
        <section
          id="jami-chat"
          className="jami-chat"
          role="dialog"
          aria-label="Chat con Jami"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <header>
            <MessageCircle />
            <strong>Jami, contigo</strong>
            <button
              className="icon-button"
              aria-label="Cerrar conversación"
              onClick={() => setOpen(false)}
            >
              <X />
            </button>
          </header>
          <div
            className="jami-chat-log"
            role="log"
            aria-live="polite"
            ref={log}
          >
            {messages.map((entry, index) => (
              <div className={`chat-message ${entry.role}`} key={index}>
                <p>{entry.reply}</p>
                {entry.notice && <small>{entry.notice}</small>}
                {entry.route && routes[entry.route] && (
                  <button
                    className="text-button"
                    onClick={() => {
                      navigate(entry.route!);
                      setOpen(false);
                    }}
                  >
                    {routes[entry.route]}
                  </button>
                )}
              </div>
            ))}
            {busy && <p role="status">Jami está respondiendo…</p>}
          </div>
          <div className="chat-suggestions">
            {["¿Cómo van mis gastos?", "Quiero ahorrar", "Abrir carrito"].map(
              (s) => (
                <button disabled={busy} key={s} onClick={() => send(s)}>
                  {s}
                </button>
              ),
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input.trim());
            }}
          >
            <label className="sr-only" htmlFor="jami-question">
              Mensaje para Jami
            </label>
            <input
              id="jami-question"
              maxLength={2000}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu pregunta…"
            />
            <button
              className="icon-button"
              disabled={busy || !input.trim()}
              aria-label="Enviar mensaje"
            >
              <Send />
            </button>
          </form>
          <small className="chat-privacy">
            Si autorizaste IA, tu pregunta y un resumen del hogar se procesan
            con Gemini. El chat se mantiene solo en esta sesión.
          </small>
        </section>
      )}
    </>,
    container,
  );
}
