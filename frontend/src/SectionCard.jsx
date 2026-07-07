import { useState } from 'react';
import { shortDays } from './days';
import { isInHorario } from './horarioStore';
import { AddToHorarioPicker } from './AddToHorarioPicker';

function SeatBadge({ seatsAvailable, maximumEnrollment }) {
  const full = seatsAvailable <= 0;
  return (
    <span className={`seat-badge ${full ? 'seat-badge--full' : 'seat-badge--open'}`}>
      {seatsAvailable}/{maximumEnrollment} cupos
    </span>
  );
}

function MeetingRow({ meeting }) {
  const time = meeting.beginTime && meeting.endTime ? `${meeting.beginTime}–${meeting.endTime}` : null;
  const place = [meeting.building, meeting.room].filter(Boolean).join(' · ');
  return (
    <li className="meeting-row">
      <span className="meeting-type">{meeting.typeDescription}</span>
      {meeting.days.length > 0 && <span>{shortDays(meeting.days)}</span>}
      {time && <span>{time}</span>}
      {place && <span className="meeting-place">{place}</span>}
    </li>
  );
}

export function SectionCard({ section, onAddToHorario }) {
  const alreadyAdded = isInHorario(section.nrc);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <article className="section-card">
      <header className="section-card__header">
        <div>
          <h3>{section.subjectCourse} &middot; Sección {section.section}</h3>
          <p className="section-card__title">{section.title}</p>
        </div>
        <div className="section-card__header-actions">
          <SeatBadge seatsAvailable={section.seatsAvailable} maximumEnrollment={section.maximumEnrollment} />
          <button
            type="button"
            className={`add-to-horario-btn ${alreadyAdded ? 'add-to-horario-btn--added' : ''}`}
            onClick={() => setPickerOpen(true)}
            disabled={alreadyAdded}
          >
            {alreadyAdded ? '✓ en tu horario' : '+ agregar a mi horario'}
          </button>
        </div>
      </header>

      <dl className="section-card__meta">
        <div>
          <dt>NRC</dt>
          <dd>{section.nrc}</dd>
        </div>
        <div>
          <dt>Créditos</dt>
          <dd>{section.credits}</dd>
        </div>
        <div>
          <dt>Campus</dt>
          <dd>{section.campus}</dd>
        </div>
        <div>
          <dt>Formato</dt>
          <dd>{section.instructionalMethod}</dd>
        </div>
      </dl>

      {section.instructors.length > 0 && (
        <p className="section-card__instructors">
          {section.instructors.map((i) => i.name).join(', ')}
        </p>
      )}

      {section.meetings.length > 0 && (
        <ul className="meeting-list">
          {section.meetings.map((m, i) => (
            <MeetingRow key={i} meeting={m} />
          ))}
        </ul>
      )}

      {pickerOpen && (
        <AddToHorarioPicker
          section={section}
          onClose={() => setPickerOpen(false)}
          onAdded={(updated) => onAddToHorario?.(updated)}
        />
      )}
    </article>
  );
}
