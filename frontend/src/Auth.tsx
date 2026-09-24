import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile,
  sendPasswordResetEmail,
} from "firebase/auth";
import { Eye, EyeOff, User, Mail, Lock } from "lucide-react";
import { auth, errorMessage } from "./firebase";
import { Button, Next, ErrorText } from "./ui";
export function Auth() {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "signup") {
        const u = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(u.user, { displayName: name });
      } else await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    setError("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    setError("");
    if (!email) {
      setError("Escribe tu correo electrónico para recuperar el acceso.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setNotice(
        "Si existe una cuenta con ese correo, recibirás instrucciones para recuperar el acceso.",
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <main className="auth-page">
      <div
        className="welcome-art"
        role="img"
        aria-label="Summa y Jami te dan la bienvenida"
      />
      <section className="auth-card">
        <h1>
          ¡Bienvenido a <em>SUMMA!</em>
        </h1>
        <p className="subtitle">Tu hogar, tus metas, en un solo lugar.</p>
        <div className="segmented">
          <button
            onClick={() => {
              setMode("signup");
              setError("");
            }}
            className={mode === "signup" ? "active" : ""}
          >
            Crear cuenta
          </button>
          <button
            onClick={() => {
              setMode("login");
              setError("");
            }}
            className={mode === "login" ? "active" : ""}
          >
            Iniciar sesión
          </button>
        </div>
        <form onSubmit={submit}>
          {mode === "signup" && (
            <label className="input-icon">
              <User />
              <input
                aria-label="Nombre completo"
                autoComplete="name"
                placeholder="Nombre completo"
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          <label className="input-icon">
            <Mail />
            <input
              type="email"
              autoComplete="email"
              aria-label="Correo electrónico"
              placeholder="Correo electrónico"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="input-icon">
            <Lock />
            <input
              type={visible ? "text" : "password"}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              minLength={6}
              aria-label="Contraseña"
              placeholder="Contraseña"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="icon-button"
              aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
              onClick={() => setVisible(!visible)}
            >
              {visible ? <EyeOff /> : <Eye />}
            </button>
          </label>
          <ErrorText text={error} />
          {notice && <p role="status">{notice}</p>}
          <Button busy={busy}>
            <Next>
              {mode === "signup" ? "Crear mi cuenta" : "Iniciar sesión"}
            </Next>
          </Button>
        </form>
        <button className="button google" disabled={busy} onClick={google}>
          Continuar con Google
        </button>
        {mode === "login" ? (
          <button className="text-button" onClick={reset}>
            Olvidé mi contraseña
          </button>
        ) : (
          <p className="auth-foot">
            ¿Ya tienes una cuenta?{" "}
            <button className="text-button" onClick={() => setMode("login")}>
              Iniciar sesión
            </button>
          </p>
        )}
        <small>
          Al continuar aceptas el{" "}
          <a href="/privacidad.html" target="_blank" rel="noreferrer">
            aviso de privacidad
          </a>
          .
        </small>
      </section>
    </main>
  );
}
