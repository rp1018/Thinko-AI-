import { useState } from 'react';
import { motion } from 'motion/react';
import LatticeLoader from './LatticeLoader';
import { authAvailable, authMessage, emailLogin, emailSignup, googleLogin } from '../lib/firebase';

export default function AuthScreen({ onGuest }) {
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async fn => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(authMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = e => {
    e.preventDefault();
    if (!email.trim() || !pass) return setError('Enter your email and password.');
    run(() => (signup ? emailSignup(email.trim(), pass) : emailLogin(email.trim(), pass)));
  };

  return (
    <div className="auth">
      <motion.div className="auth__card" initial={{ opacity: 0, y: 22, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}>
        <div className="auth__mark">
          <LatticeLoader label="" showTimer={false} pattern="orbit" cellSize={10} gap={3} color="#d4af6a" idleOpacity={0.22} />
        </div>
        <h1>Thinko</h1>
        <p className="auth__sub">{signup ? 'Create your account' : 'Welcome back'}</p>

        {authAvailable ? (
          <>
            <button type="button" className="btn btn--wide" disabled={busy} onClick={() => run(googleLogin)}>
              <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
                <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
                <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
              </svg>
              Continue with Google
            </button>

            <div className="auth__or">
              <span>or</span>
            </div>

            <form onSubmit={submit} className="auth__form">
              <input className="field" type="email" placeholder="Email address" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
              <input className="field" type="password" placeholder="Password" autoComplete={signup ? 'new-password' : 'current-password'} value={pass} onChange={e => setPass(e.target.value)} />
              {error ? <p className="auth__error" role="alert">{error}</p> : null}
              <button type="submit" className="btn btn--gold btn--wide" disabled={busy}>
                {busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
              </button>
            </form>

            <p className="auth__switch">
              {signup ? 'Already have an account?' : 'New here?'}{' '}
              <button type="button" onClick={() => { setSignup(s => !s); setError(''); }}>
                {signup ? 'Sign in' : 'Create an account'}
              </button>
            </p>
          </>
        ) : null}

        <button type="button" className="auth__guest" onClick={onGuest}>
          Continue as guest
        </button>
      </motion.div>
    </div>
  );
}
