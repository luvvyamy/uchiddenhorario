import { useState } from 'react';
import { loginWithUc, LoginFailedError } from './api';

export function LoginForm({ onLoggedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | error
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage('');

    try {
      const { token } = await loginWithUc(username, password);
      setPassword('');
      onLoggedIn(token, username);
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof LoginFailedError ? err.message : 'No se pudo conectar con el servidor.');
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Usuario UC"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="username"
      />
      <input
        type="password"
        placeholder="Contraseña UC"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
      />
      <button type="submit" disabled={status === 'loading' || !username || !password}>
        {status === 'loading' ? 'Entrando…' : 'Iniciar sesión'}
      </button>
      {status === 'error' && <p className="banner banner--danger login-form__error">{errorMessage}</p>}
    </form>
  );
}
