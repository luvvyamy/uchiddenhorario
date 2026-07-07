import { useState } from 'react';
import { searchCourse, AuthExpiredError } from './api';
import { SectionCard } from './SectionCard';
import { LoginForm } from './LoginForm';
import { HorarioGrid } from './HorarioGrid';
import { AdvancedFilters } from './AdvancedFilters';
import { listHorario } from './horarioStore';

const DEFAULT_TERM = '202622'; // 2026 Segundo Semestre

function hasAnyFilter(f) {
  return Object.values(f).some((v) => (Array.isArray(v) ? v.length > 0 : v != null && v !== false));
}

function App() {
  const [subjectCourse, setSubjectCourse] = useState('');
  const [term, setTerm] = useState(DEFAULT_TERM);
  const [filters, setFilters] = useState({});
  const [sections, setSections] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | error | authExpired
  const [errorMessage, setErrorMessage] = useState('');
  const [horario, setHorario] = useState(() => listHorario());

  // Held only in memory (React state), never localStorage: this token
  // grants read access to the user's own UC session, so it shouldn't
  // outlive the tab any more than necessary.
  const [authToken, setAuthToken] = useState(null);
  const [loggedInAs, setLoggedInAs] = useState(null);

  function handleLoggedIn(token, username) {
    setAuthToken(token);
    setLoggedInAs(username);
  }

  function handleLogout() {
    setAuthToken(null);
    setLoggedInAs(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const code = subjectCourse.trim().toUpperCase();
    if (!code && !hasAnyFilter(filters)) return;

    setStatus('loading');
    setErrorMessage('');

    try {
      const result = await searchCourse(code || undefined, term, authToken, filters);
      setSections(result.sections);
      setStatus('idle');
    } catch (err) {
      setErrorMessage(err.message);
      if (err instanceof AuthExpiredError) {
        setStatus('authExpired');
        if (authToken) handleLogout();
      } else {
        setStatus('error');
      }
      setSections(null);
    }
  }

  return (
    <div className="page">
      <header className="page__header">
        <h1>uchiddenhorario</h1>
        <p>Buscador rápido de secciones y horarios UC</p>
      </header>

      <section className="auth-panel">
        {loggedInAs ? (
          <p className="auth-panel__status">
            Conectado como <strong>{loggedInAs}</strong>{' '}
            <button type="button" className="link-button" onClick={handleLogout}>
              cerrar sesión
            </button>
          </p>
        ) : (
          <>
            <p className="auth-panel__status">Inicia sesión con tu cuenta UC para buscar ramos:</p>
            <LoginForm onLoggedIn={handleLoggedIn} />
          </>
        )}
      </section>

      {loggedInAs && (
        <form className="search-form" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Ej: IIC2133"
            value={subjectCourse}
            onChange={(e) => setSubjectCourse(e.target.value)}
            autoFocus
          />
          <select value={term} onChange={(e) => setTerm(e.target.value)}>
            <option value="202622">2026 Segundo Semestre</option>
            <option value="202610">2026 Primer Semestre</option>
            <option value="202512">2025 Segundo Semestre</option>
          </select>
          <button type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? 'Buscando…' : 'Buscar'}
          </button>
        </form>
      )}

      {loggedInAs && (
        <AdvancedFilters term={term} token={authToken} filters={filters} onChange={setFilters} />
      )}

      {status === 'authExpired' && (
        <p className="banner banner--warn">
          {errorMessage || 'Tu sesión UC expiró, inicia sesión de nuevo.'}
        </p>
      )}
      {status === 'error' && (
        <p className="banner banner--danger">{errorMessage || 'Algo falló buscando el ramo.'}</p>
      )}

      {sections !== null && status === 'idle' && (
        <main className="results">
          {sections.length === 0 ? (
            <p className="empty-state">No se encontraron secciones con estos criterios.</p>
          ) : (
            sections.map((s) => (
              <SectionCard key={s.nrc} section={s} onAddToHorario={setHorario} />
            ))
          )}
        </main>
      )}

      <section className="horario-section">
        <h2>Mi Horario 💖</h2>
        <HorarioGrid entries={horario} onChange={setHorario} />
      </section>
    </div>
  );
}

export default App;
