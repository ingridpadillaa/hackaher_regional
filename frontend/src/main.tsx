import React, { useEffect, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  NavLink,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  House,
  ShoppingCart,
  ChartNoAxesCombined,
  UserRound,
  Bell,
  X,
  CheckCheck,
} from "lucide-react";
import { auth, configured, call, errorMessage } from "./firebase";
import { type State } from "./types";
import { Logo, Button, ErrorText, Modal } from "./ui";
import { Auth } from "./Auth";
import { Household } from "./Household";
import { Profile } from "./Profile";
import { Home } from "./Home";
import { Cart } from "./Cart";
import { Simulator } from "./Simulator";
import { MovementModal } from "./MovementModal";
import { JamiChat } from "./JamiChat";
import "./styles.css";
const incomingInvite = new URLSearchParams(window.location.search).get(
  "invite",
);
if (
  incomingInvite &&
  /^(?:[A-Fa-f0-9]{16}|[A-Fa-f0-9]{32})$/.test(incomingInvite)
)
  sessionStorage.setItem("summa-invite", incomingInvite.toUpperCase());
function App() {
  const [inviteNotice, setInviteNotice] = useState(
    !!sessionStorage.getItem("summa-invite"),
  );
  const [signed, setSigned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [movement, setMovement] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const refresh = useCallback(async () => {
    try {
      const result = await call<State>("bootstrap");
      setState(result);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
      throw e;
    }
  }, []);
  useEffect(
    () =>
      onAuthStateChanged(auth, async (user) => {
        setLoading(true);
        setSigned(!!user);
        setState(null);
        if (user) {
          try {
            await refresh();
            navigate("/", { replace: true });
          } catch {}
        }
        setLoading(false);
      }),
    [refresh],
  );
  if (!configured)
    return (
      <main className="page">
        <Logo />
        <h1>Falta conectar Firebase</h1>
        <p>
          Configura las variables públicas de Firebase antes de publicar esta
          aplicación.
        </p>
      </main>
    );
  if (loading)
    return (
      <div className="loading">
        <span className="spinner" />
        <p>Preparando tu hogar…</p>
      </div>
    );
  if (!signed) return <Auth />;
  if (!state)
    return (
      <main className="page">
        <Logo />
        <ErrorText text={error} />
        <Button onClick={() => refresh().catch(() => {})}>
          Volver a intentar
        </Button>
        <button className="text-button" onClick={() => signOut(auth)}>
          Cerrar sesión
        </button>
      </main>
    );
  if (!state.home) return <Household onSaved={refresh} />;
  if (!state.user.personalizacionCompleta || !state.home.personalized)
    return (
      <Profile key={state.home.id} state={state} onSaved={refresh} initial />
    );
  async function readAll() {
    try {
      await call("markNotifications", {
        ids: state!.notifications.map((n) => n.id),
      });
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  const unread = state.notifications.filter((n) => !n.read).length;
  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink to="/" aria-label="Ir al inicio">
          <Logo small />
        </NavLink>
        <span className="household-label">{state.home.name}</span>
        <button
          className="icon-button bell"
          aria-label={`Notificaciones${unread ? `, ${unread} sin leer` : ""}`}
          onClick={() => setNotifications(true)}
        >
          <Bell size={23} />
          {unread > 0 && <i />}
        </button>
        <NavLink
          to="/perfil"
          className="avatar account"
          aria-label="Perfil de la cuenta"
        >
          {(state.user.nombre || "").slice(0, 2).toUpperCase()}
        </NavLink>
      </header>
      {error && (
        <div className="global-error">
          <ErrorText text={error} />
        </div>
      )}
      {inviteNotice && sessionStorage.getItem("summa-invite") && (
        <p className="invite-preview">
          Ya perteneces a {state.home?.name}. La invitación no cambia tu hogar
          automáticamente.{" "}
          <button
            className="text-button"
            onClick={() => {
              sessionStorage.removeItem("summa-invite");
              setInviteNotice(false);
            }}
          >
            Descartar invitación
          </button>
        </p>
      )}
      <Routes>
        <Route
          path="/"
          element={
            <Home
              state={state}
              onRegister={() => setMovement(true)}
              onSaved={refresh}
              success={success}
            />
          }
        />
        <Route
          path="/carrito"
          element={<Cart state={state} onSaved={refresh} />}
        />
        <Route
          path="/simulador"
          element={<Simulator state={state} onSaved={refresh} />}
        />
        <Route
          path="/perfil"
          element={<Profile state={state} onSaved={refresh} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <nav className="bottom-nav" aria-label="Módulos principales">
        {[
          { path: "/", label: "Inicio", icon: House },
          { path: "/carrito", label: "Carrito", icon: ShoppingCart },
          { path: "/simulador", label: "Simulador", icon: ChartNoAxesCombined },
          { path: "/perfil", label: "Perfil", icon: UserRound },
        ].map(({ path, label, icon: Icon }) => (
          <NavLink key={path} to={path} end={path === "/"}>
            <Icon size={23} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      {movement && (
        <MovementModal
          date={state.date}
          onClose={() => setMovement(false)}
          onSaved={async () => {
            await refresh();
            setSuccess(true);
          }}
        />
      )}
      {notifications && (
        <div className="notifications-wrap">
          <Modal title="Notificaciones" onClose={() => setNotifications(false)}>
            <button className="text-button" onClick={readAll}>
              <CheckCheck size={18} />
              Marcar como leídas
            </button>
            {state.notifications.length ? (
              state.notifications.map((n) => (
                <article
                  className={"notice " + (n.read ? "read" : "")}
                  key={n.id}
                >
                  <span className="tile">
                    <Bell size={19} />
                  </span>
                  <div>
                    <h3>{n.title}</h3>
                    <p>{n.message}</p>
                  </div>
                </article>
              ))
            ) : (
              <p>Todo en orden por ahora.</p>
            )}
          </Modal>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
    <JamiChat />
  </BrowserRouter>,
);
