import { interfaceText, presentResponse } from "./presentation";
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "firebase/functions";
const emulator = import.meta.env.VITE_USE_EMULATORS === "true";
const config = {
  apiKey: emulator ? "demo-key" : import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: emulator
    ? "demo-summa.firebaseapp.com"
    : import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: emulator ? "demo-summa" : import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: emulator ? "demo-app" : import.meta.env.VITE_FIREBASE_APP_ID,
};
export const configured = Object.values(config).every(Boolean);
const app = initializeApp(
  configured
    ? config
    : { apiKey: "missing", projectId: "missing", appId: "missing" },
  "summa",
);
export const auth = getAuth(app);
const functions = getFunctions(app, "us-central1");
if (emulator) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
export async function call<T = any>(
  action: string,
  payload?: unknown,
): Promise<T> {
  const result = await httpsCallable(functions, "api", { timeout: 120000 })({
    action,
    payload,
  });
  return presentResponse(result.data as T);
}
export function errorMessage(e: unknown) {
  const code = (e as any)?.code ?? "";
  const messages: Record<string, string> = {
    "auth/invalid-credential": "El correo o la contraseña no coinciden.",
    "auth/email-already-in-use":
      "Este correo ya tiene una cuenta. Inicia sesión.",
    "auth/weak-password": "Usa una contraseña de al menos 6 caracteres.",
    "auth/popup-closed-by-user": "La ventana se cerró antes de iniciar sesión.",
    "auth/operation-not-allowed":
      "Este método de acceso aún no está habilitado.",
    "auth/unauthorized-domain":
      "Este dominio aún no está autorizado para iniciar sesión.",
    "auth/network-request-failed": "Revisa tu conexión e intenta de nuevo.",
    "functions/unavailable":
      "No pudimos conectar. Revisa tu conexión e intenta de nuevo.",
  };
  return interfaceText(
    messages[code] ??
    (e instanceof Error ? e.message : "No pudimos completar la operación.")
  );
}
