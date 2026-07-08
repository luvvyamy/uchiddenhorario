import { useEffect, useRef, useState } from 'react';
import { searchSubjectCourseCombos } from './api';

// txt_subjectcoursecombo (what the search actually filters by) only
// matches a COMPLETE sigla exactly -- "IIC" or "IIC3" return zero results
// against search itself. get_subjectcoursecombo is the real autocomplete
// endpoint Banner's own UI calls as you type, and it prefix-matches
// ("IIC3" -> IIC3103, IIC3104, ...), so this narrows suggestions live and
// only ever commits a complete sigla to the actual search.
export function SubjectCourseTypeahead({ value, onChange, term, token }) {
  const [results, setResults] = useState([]);
  const debounceRef = useRef(null);
  // Bumped on every pick (and every keystroke) so an in-flight fetch from
  // a stale request can tell it's stale and skip its own setResults --
  // otherwise a suggestion clicked right as a previous fetch resolves
  // would still get overwritten back open by that late response.
  const requestIdRef = useRef(0);
  // Set right after a suggestion is picked, so the effect that fires on
  // `value` changing knows this particular change was a selection, not
  // the user typing -- otherwise get_subjectcoursecombo happily matches
  // the now-complete sigla against itself and repopulates `results`
  // right after pick() cleared it, making the dropdown pop back open.
  const justPickedRef = useRef(false);

  useEffect(() => {
    if (justPickedRef.current) {
      justPickedRef.current = false;
      return;
    }
    if (!token || !value || value.length < 2) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    const requestId = ++requestIdRef.current;
    debounceRef.current = setTimeout(() => {
      searchSubjectCourseCombos(value, term, token)
        .then((r) => {
          if (requestIdRef.current === requestId) setResults(r);
        })
        .catch(() => {
          if (requestIdRef.current === requestId) setResults([]);
        });
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [value, term, token]);

  function pick(combo) {
    requestIdRef.current++;
    justPickedRef.current = true;
    clearTimeout(debounceRef.current);
    setResults([]);
    onChange(combo.code);
  }

  return (
    <div className="typeahead">
      <input
        type="text"
        placeholder="Ej: IIC2133"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setResults([]);
        }}
        autoFocus
      />
      {results.length > 0 && (
        <ul className="typeahead__results">
          {results.map((r) => (
            <li key={r.code} onClick={() => pick(r)}>
              {r.code}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
