import { useCallback, useEffect, useState } from 'react';
import { createAnonymousSession, searchCourse, AuthExpiredError } from './api';
import { SectionCard } from './SectionCard';
import { HorarioGrid } from './HorarioGrid';
import { AdvancedFilters } from './AdvancedFilters';
import { SubjectCourseTypeahead } from './SubjectCourseTypeahead';
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
  // grants access to one anonymous Banner search session.
  const [authToken, setAuthToken] = useState(null);
  const [authStatus, setAuthStatus] = useState('loading'); // loading | ready | error
  const [authError, setAuthError] = useState('');

  const refreshAnonymousSession = useCallback(async () => {
    setAuthStatus('loading');
    setAuthError('');

    try {
      const { token } = await createAnonymousSession();
      setAuthToken(token);
      setAuthStatus('ready');
    } catch (err) {
      setAuthToken(null);
      setAuthStatus('error');
      setAuthError('No se pudo crear una sesión anónima con Banner.');
    }
  }, []);

  useEffect(() => {
    refreshAnonymousSession();
  }, [refreshAnonymousSession]);

  async function handleSubmit(e) {
    e.preventDefault();
    const code = subjectCourse.trim().toUpperCase();
    if ((!code && !hasAnyFilter(filters)) || !authToken) return;

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
        await refreshAnonymousSession();
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

      {authStatus === 'error' && (
        <p className="banner banner--danger">
          {authError} Recarga la página para intentarlo de nuevo.
        </p>
      )}

      {authToken && (
        <form className="search-form" onSubmit={handleSubmit}>
          <SubjectCourseTypeahead
            value={subjectCourse}
            onChange={setSubjectCourse}
            term={term}
            token={authToken}
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

      {authToken && (
        <AdvancedFilters term={term} token={authToken} filters={filters} onChange={setFilters} />
      )}

      {status === 'authExpired' && (
        <p className="banner banner--warn">
          {errorMessage || 'Tu sesión anónima expiró, se creó una nueva.'}
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
