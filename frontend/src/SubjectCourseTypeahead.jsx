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

  useEffect(() => {
    if (!token || !value || value.length < 2) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchSubjectCourseCombos(value, term, token)
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [value, term, token]);

  function pick(combo) {
    onChange(combo.code);
    setResults([]);
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
