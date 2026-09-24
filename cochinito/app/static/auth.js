import {
    initializeApp
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup,
    setPersistence,
    inMemoryPersistence,
    signOut
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
const auth = getAuth(initializeApp(JSON.parse(document.getElementById('firebase-config').textContent)));
await setPersistence(auth, inMemoryPersistence);
async function login(action) {
    try {
        const credential = await action();
        await api('/auth/session', {
            token: await credential.user.getIdToken()
        });
        await signOut(auth);
        location.href = '/';
    } catch (error) {
        document.getElementById('auth-error').textContent = 'No pudimos iniciar sesión. Verifica tus datos y la configuración de Firebase.';
    }
}
const credentials = () => [auth, document.getElementById('email').value, document.getElementById('password').value];
document.getElementById('firebase-login').onsubmit = e => {
    e.preventDefault();
    login(() => signInWithEmailAndPassword(...credentials()));
};
document.getElementById('register').onclick = () => login(() => createUserWithEmailAndPassword(...credentials()));
document.getElementById('google').onclick = () => login(() => signInWithPopup(auth, new GoogleAuthProvider()));
