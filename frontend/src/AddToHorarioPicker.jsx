import { useState } from 'react';
import { shortDays } from './days';
import { looksLikeOneOff } from './meetingHeuristics';
import { addToHorario } from './horarioStore';

export function AddToHorarioPicker({ section, onClose, onAdded }) {
  const [checked, setChecked] = useState(() =>
    Object.fromEntries(section.meetings.map((m, i) => [i, !looksLikeOneOff(m)]))
  );

  function toggle(i) {
    setChecked((prev) => ({ ...prev, [i]: !prev[i] }));
  }

  function handleConfirm() {
    const weeklySchedule = section.meetings.filter((_, i) => checked[i]);
    const updated = addToHorario({ ...section, weeklySchedule });
    onAdded(updated);
    onClose();
  }

  return (
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker" onClick={(e) => e.stopPropagation()}>
        <h3>¿Qué horarios agregar de {section.subjectCourse} · Sec {section.section}?</h3>
        <p className="picker__hint">
          Destildamos lo que parecen ser interrogaciones/exámenes (fechas puntuales), pero revisa tú misma, no somos infalibles ✨
        </p>
        <ul className="picker__list">
          {section.meetings.map((m, i) => (
            <li key={i} className="picker__item">
              <label>
                <input type="checkbox" checked={!!checked[i]} onChange={() => toggle(i)} />
                <span className="picker__item-type">{m.typeDescription}</span>
                {m.days.length > 0 && <span>{shortDays(m.days)}</span>}
                {m.beginTime && m.endTime && (
                  <span>
                    {m.beginTime}–{m.endTime}
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>
        <div className="picker__actions">
          <button type="button" className="link-button" onClick={onClose}>
            cancelar
          </button>
          <button type="button" className="add-to-horario-btn" onClick={handleConfirm}>
            agregar a mi horario
          </button>
        </div>
      </div>
    </div>
  );
}
