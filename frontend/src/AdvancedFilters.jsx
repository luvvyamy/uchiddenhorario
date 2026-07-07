import { useEffect, useRef, useState } from 'react';
import { getFilterOptions, searchInstructors } from './api';

const DAY_LABELS = [
  { key: 0, label: 'Dom' },
  { key: 1, label: 'Lun' },
  { key: 2, label: 'Mar' },
  { key: 3, label: 'Mié' },
  { key: 4, label: 'Jue' },
  { key: 5, label: 'Vie' },
  { key: 6, label: 'Sáb' },
];

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

function TimeSelect({ value, onChange }) {
  return (
    <span className="time-select">
      <select value={value.hour} onChange={(e) => onChange({ ...value, hour: e.target.value })}>
        <option value="" />
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      :
      <select value={value.min} onChange={(e) => onChange({ ...value, min: e.target.value })}>
        <option value="" />
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select value={value.ampm} onChange={(e) => onChange({ ...value, ampm: e.target.value })}>
        <option value="" />
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </span>
  );
}

const EMPTY_TIME = { hour: '', min: '', ampm: '' };

export function AdvancedFilters({ term, token, filters, onChange }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState(null);
  const [instructorQuery, setInstructorQuery] = useState('');
  const [instructorResults, setInstructorResults] = useState([]);
  const [selectedInstructorLabel, setSelectedInstructorLabel] = useState('');
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!open || !token || options) return;
    getFilterOptions(term, token)
      .then(setOptions)
      .catch(() => setOptions(null));
  }, [open, token, term, options]);

  // Term changed (e.g. user switched semesters): cached options are
  // scoped to a term, so stale ones from a previous term must be dropped.
  useEffect(() => {
    setOptions(null);
  }, [term]);

  useEffect(() => {
    if (!instructorQuery || instructorQuery.length < 2) {
      setInstructorResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchInstructors(instructorQuery, term, token)
        .then(setInstructorResults)
        .catch(() => setInstructorResults([]));
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [instructorQuery, term, token]);

  function set(key, value) {
    onChange({ ...filters, [key]: value });
  }

  function toggleDay(day) {
    const current = filters.daysOfWeek ?? [];
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    set('daysOfWeek', next);
  }

  function pickInstructor(instructor) {
    set('instructor', instructor.code);
    setSelectedInstructorLabel(instructor.description);
    setInstructorResults([]);
    setInstructorQuery('');
  }

  function clearInstructor() {
    set('instructor', undefined);
    setSelectedInstructorLabel('');
  }

  return (
    <div className="advanced-filters">
      <button type="button" className="link-button" onClick={() => setOpen((o) => !o)}>
        {open ? 'ocultar filtros avanzados ▲' : 'filtros avanzados ▼'}
      </button>

      {open && (
        <div className="advanced-filters__body">
          <div className="filter-field">
            <label>Profesor</label>
            {filters.instructor ? (
              <span className="filter-chip">
                {selectedInstructorLabel || filters.instructor}
                <button type="button" className="filter-chip__remove" onClick={clearInstructor}>
                  ×
                </button>
              </span>
            ) : (
              <div className="typeahead">
                <input
                  type="text"
                  placeholder="Escribe un nombre..."
                  value={instructorQuery}
                  onChange={(e) => setInstructorQuery(e.target.value)}
                />
                {instructorResults.length > 0 && (
                  <ul className="typeahead__results">
                    {instructorResults.map((r) => (
                      <li key={r.code} onClick={() => pickInstructor(r)}>
                        {r.description}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {options && (
            <>
              <div className="filter-field">
                <label>Escuela</label>
                <select value={filters.college ?? ''} onChange={(e) => set('college', e.target.value || undefined)}>
                  <option value="">-- Todas --</option>
                  {options.college.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-field">
                <label>Campus</label>
                <select value={filters.campus ?? ''} onChange={(e) => set('campus', e.target.value || undefined)}>
                  <option value="">-- Todos --</option>
                  {options.campus.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-field">
                <label>Formato Curso</label>
                <select
                  value={filters.instructionalMethod ?? ''}
                  onChange={(e) => set('instructionalMethod', e.target.value || undefined)}
                >
                  <option value="">-- Todos --</option>
                  {options.instructionalMethod.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-field">
                <label>Área Formación General</label>
                <select value={filters.attribute ?? ''} onChange={(e) => set('attribute', e.target.value || undefined)}>
                  <option value="">-- Todas --</option>
                  {options.attribute.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-field">
                <label>Permite Retiro</label>
                <select value={filters.partOfTerm ?? ''} onChange={(e) => set('partOfTerm', e.target.value || undefined)}>
                  <option value="">-- Todos --</option>
                  {options.partOfTerm.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.description}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="filter-field">
            <label>
              <input
                type="checkbox"
                checked={!!filters.openOnly}
                onChange={(e) => set('openOnly', e.target.checked || undefined)}
              />{' '}
              Solo cursos con vacantes disponibles
            </label>
          </div>

          <div className="filter-field">
            <label>Días de Clases</label>
            <div className="day-checkboxes">
              {DAY_LABELS.map((d) => (
                <label key={d.key} className="day-checkbox">
                  <input
                    type="checkbox"
                    checked={(filters.daysOfWeek ?? []).includes(d.key)}
                    onChange={() => toggleDay(d.key)}
                  />
                  {d.label}
                </label>
              ))}
            </div>
          </div>

          <div className="filter-field">
            <label>Hora Inicio</label>
            <TimeSelect
              value={filters.startTime ?? EMPTY_TIME}
              onChange={(v) => set('startTime', v.hour || v.min || v.ampm ? v : undefined)}
            />
          </div>

          <div className="filter-field">
            <label>Hora Fin</label>
            <TimeSelect
              value={filters.endTime ?? EMPTY_TIME}
              onChange={(v) => set('endTime', v.hour || v.min || v.ampm ? v : undefined)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
