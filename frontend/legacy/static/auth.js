import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {
    getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
    GoogleAuthProvider, signInWithPopup, setPersistence, inMemoryPersistence,
    signOut, sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';

const configNode = document.getElementById('firebase-config');
const status = document.getElementById('auth-error');
const show = message => { if (status) status.textContent = message; };
const messages = {
    'auth/popup-blocked': 'Permite ventanas emergentes para continuar con Google.',
    'auth/popup-closed-by-user': 'Se cerró la ventana de Google. Puedes intentarlo de nuevo.',
    'auth/unauthorized-domain': 'Este dominio no está autorizado en Firebase Authentication.',
    'auth/operation-not-allowed': 'Habilita este método de acceso en Firebase Authentication.',
    'auth/invalid-email': 'Revisa el formato del correo electrónico.',
    'auth/weak-password': 'Usa una contraseña más segura, de al menos 8 caracteres.',
    'auth/email-already-in-use': 'Este correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.',
    'auth/invalid-credential': 'No pudimos iniciar sesión. Revisa tu correo y contraseña.',
    'auth/too-many-requests': 'Espera unos minutos antes de intentarlo de nuevo.',
    'auth/network-request-failed': 'No hay conexión con Firebase. Revisa tu conexión a internet.'
};
let auth;
try {
    auth = getAuth(initializeApp(JSON.parse(configNode.textContent)));
    await setPersistence(auth, inMemoryPersistence);
} catch {
    show('Firebase no está configurado correctamente. Revisa FIREBASE_WEB_* y /health.');
}
let busy = false;
async function login(action) {
    if (!auth || busy) return;
    busy = true;
    show('Conectando…');
    try {
        const credential = await action();
        const response = await fetch('/auth/session', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content },
            body: JSON.stringify({ token: await credential.user.getIdToken() })
        });
        if (!response.ok) throw new Error('server-session');
        const data = await response.json();
        location.assign(data.next === '/onboarding' ? '/onboarding' : '/');
    } catch (error) {
        show(messages[error.code] || 'No pudimos crear tu sesión. Revisa la configuración o vuelve a iniciar sesión.');
    } finally {
        if (auth) await signOut(auth).catch(() => {});
        busy = false;
    }
}
const credentials = () => [auth, document.getElementById('email').value.trim(), document.getElementById('password').value];
const form = document.getElementById('firebase-login');
form?.addEventListener('submit', event => {
    event.preventDefault();
    if (form.reportValidity()) login(() => signInWithEmailAndPassword(...credentials()));
});
document.getElementById('register')?.addEventListener('click', () => {
    if (form.reportValidity()) login(() => createUserWithEmailAndPassword(...credentials()));
});
document.getElementById('google')?.addEventListener('click', () => login(() => signInWithPopup(auth, new GoogleAuthProvider())));
document.getElementById('reset-password')?.addEventListener('click', async () => {
    const email = document.getElementById('email');
    if (!auth || !email.reportValidity()) return;
    try {
        await sendPasswordResetEmail(auth, email.value.trim());
        show('Si existe una cuenta para ese correo, recibirás instrucciones para recuperar tu contraseña.');
    } catch (error) {
        show(error.code === 'auth/user-not-found'
            ? 'Si existe una cuenta para ese correo, recibirás instrucciones para recuperar tu contraseña.'
            : messages[error.code] || 'No pudimos solicitar la recuperación. Inténtalo más tarde.');
    }
});
document.querySelector('form[action="/auth/logout"]')?.addEventListener('submit', async event => {
    if (!auth) return;
    event.preventDefault();
    const logoutForm = event.currentTarget;
    await signOut(auth).catch(() => {});
    logoutForm.submit();
});
