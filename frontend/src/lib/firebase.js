import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';

// Public web config (thinko-ai)
const firebaseConfig = {
  apiKey: 'AIzaSyDr5019IjZ9ZqRGbIHvrguNYBsblSH6CXw',
  authDomain: 'thinko-ai.firebaseapp.com',
  projectId: 'thinko-ai',
  storageBucket: 'thinko-ai.firebasestorage.app',
  messagingSenderId: '791858680864',
  appId: '1:791858680864:web:8de62a87ddaa47400fd845'
};

let auth = null;
try {
  auth = getAuth(initializeApp(firebaseConfig));
} catch (e) {
  console.warn('Firebase unavailable, guest mode only', e);
}

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

export const authAvailable = Boolean(auth);

export const watchAuth = cb => {
  if (!auth) {
    cb(null);
    return () => {};
  }
  // Process any pending redirect auth result
  getRedirectResult(auth).catch(() => {});
  return onAuthStateChanged(auth, cb);
};

export const googleLogin = async () => {
  if (!auth) throw new Error('Firebase Auth not available.');
  try {
    return await signInWithPopup(auth, provider);
  } catch (err) {
    // If popup is blocked by mobile browser or closed, fall back to redirect
    if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/popup-closed-by-user') {
      return await signInWithRedirect(auth, provider);
    }
    throw err;
  }
};

export const emailLogin = (email, pass) => signInWithEmailAndPassword(auth, email, pass);
export const emailSignup = async (email, pass) => {
  const cred = await createUserWithEmailAndPassword(auth, email, pass);
  await updateProfile(cred.user, { displayName: email.split('@')[0] });
  return cred;
};
export const logout = () => (auth ? signOut(auth) : Promise.resolve());

export const authMessage = e => {
  const code = e?.code || '';
  if (code === 'auth/unauthorized-domain') {
    return 'Domain/IP is not authorized in Firebase. Please open Thinko at http://localhost:5000 (not 127.0.0.1 or raw IP), or tap "Continue as guest".';
  }
  if (code === 'auth/popup-blocked') {
    return 'Sign-in popup was blocked by your browser. Please allow popups or tap "Continue as guest".';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Google Sign-In is not enabled in Firebase Console. You can use email/password or "Continue as guest".';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Google sign-in was closed before finishing.';
  }

  const map = {
    'auth/user-not-found': 'No account found with that email. Create one instead.',
    'auth/wrong-password': 'Wrong password. Try again.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/email-already-in-use': 'That email already has an account. Sign in instead.',
    'auth/weak-password': 'Use at least 6 characters for the password.',
    'auth/invalid-email': 'That email address doesn’t look right.',
    'auth/network-request-failed': 'Network problem. Check your internet connection.',
    'auth/too-many-requests': 'Too many attempts. Wait a bit and retry.'
  };
  return map[code] || `${e?.message || 'Something went wrong while signing in.'} (${code || 'error'})`;
};
