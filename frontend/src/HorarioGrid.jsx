import { useMemo, useState } from 'react';
import { removeFromHorario, setColor, findConflicts, blockKey } from './horarioStore';

const DAY_COLUMNS = [
  { key: 'monday', label: 'Lun' },
  { key: 'tuesday', label: 'Mar' },
  { key: 'wednesday', label: 'Mié' },
  { key: 'thursday', label: 'Jue' },
  { key: 'friday', label: 'Vie' },
  { key: 'saturday', label: 'Sáb' },
];

// UC's real class modules start on these times -- rows are drawn as a
// continuous timeline rather than fixed slots so odd-length blocks (a
// 3h83 exam block, a half-module ayudantía) still render proportionally.
const DAY_START_MIN = 8 * 60;
const DAY_END_MIN = 21 * 60 + 30;
const PX_PER_MIN = 1.4;

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const HOUR_MARKS = Array.from(
  { length: Math.ceil((DAY_END_MIN - DAY_START_MIN) / 60) + 1 },
  (_, i) => DAY_START_MIN + i * 60
).filter((min) => min <= DAY_END_MIN);

function GridBlock({ entry, block, isConflicted, isSelected, onSelect, column, columnCount }) {
  const top = (timeToMinutes(block.beginTime) - DAY_START_MIN) * PX_PER_MIN;
  const height = (timeToMinutes(block.endTime) - timeToMinutes(block.beginTime)) * PX_PER_MIN;
  const widthPct = 100 / columnCount;

  return (
    <button
      type="button"
      className={`horario-block ${isConflicted ? 'horario-block--conflict' : ''} ${isSelected ? 'horario-block--selected' : ''}`}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: `${column * widthPct}%`,
        width: `${widthPct}%`,
        backgroundColor: entry.color,
      }}
      onClick={() => onSelect(entry.nrc)}
      title={`${entry.subjectCourse} · ${block.typeDescription}`}
    >
      <span className="horario-block__course">{entry.subjectCourse}</span>
      <span className="horario-block__type">{block.typeDescription}</span>
    </button>
  );
}

// Assigns each block in a day to a side-by-side column so overlapping
// courses stay visible next to each other instead of one fully covering
// the other -- every block in a mutually-overlapping cluster shares that
// cluster's column count, so widths stay consistent within the cluster.
function layoutDayBlocks(dayBlocks) {
  const withRange = dayBlocks.map((item) => ({
    ...item,
    start: timeToMinutes(item.block.beginTime),
    end: timeToMinutes(item.block.endTime),
  }));
  withRange.sort((a, b) => a.start - b.start);

  const clusters = [];
  let current = [];
  let clusterEnd = -Infinity;
  for (const item of withRange) {
    if (current.length > 0 && item.start >= clusterEnd) {
      clusters.push(current);
      current = [];
      clusterEnd = -Infinity;
    }
    current.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (current.length > 0) clusters.push(current);

  const placed = [];
  for (const cluster of clusters) {
    cluster.forEach((item, i) => {
      placed.push({ ...item, column: i, columnCount: cluster.length });
    });
  }
  return placed;
}

export function HorarioGrid({ entries, onChange }) {
  const [selectedNrc, setSelectedNrc] = useState(null);
  const conflicts = useMemo(() => findConflicts(entries), [entries]);

  function handleRemove(nrc) {
    onChange(removeFromHorario(nrc));
    if (selectedNrc === nrc) setSelectedNrc(null);
  }

  function handleColorChange(nrc, color) {
    onChange(setColor(nrc, color));
  }

  const blocksByDay = useMemo(() => {
    const byDay = Object.fromEntries(DAY_COLUMNS.map((d) => [d.key, []]));
    for (const entry of entries) {
      for (const block of entry.weeklySchedule) {
        for (const day of block.days) {
          if (byDay[day]) byDay[day].push({ entry, block });
        }
      }
    }
    return byDay;
  }, [entries]);

  if (entries.length === 0) {
    return <p className="horario-empty">Todavía no has agregado ningún curso a tu horario ✨</p>;
  }

  return (
    <div className="horario">
      <div className="horario-grid">
        <div className="horario-grid__corner" />
        {DAY_COLUMNS.map((d) => (
          <div key={d.key} className="horario-grid__day-label">
            {d.label}
          </div>
        ))}

        <div className="horario-grid__timeline" style={{ height: `${(DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN}px` }}>
          {HOUR_MARKS.map((min) => (
            <span
              key={min}
              className="horario-grid__hour-mark"
              style={{ top: `${(min - DAY_START_MIN) * PX_PER_MIN}px` }}
            >
              {String(Math.floor(min / 60)).padStart(2, '0')}:00
            </span>
          ))}
        </div>
        {DAY_COLUMNS.map((d) => (
          <div
            key={d.key}
            className="horario-grid__column"
            style={{
              height: `${(DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN}px`,
              backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0, var(--border) 1px, transparent 1px, transparent ${60 * PX_PER_MIN}px)`,
            }}
          >
            {layoutDayBlocks(blocksByDay[d.key]).map(({ entry, block, column, columnCount }, i) => (
              <GridBlock
                key={`${entry.nrc}-${i}`}
                entry={entry}
                block={block}
                column={column}
                columnCount={columnCount}
                isConflicted={conflicts.has(blockKey(entry.nrc, block, d.key))}
                isSelected={selectedNrc === entry.nrc}
                onSelect={setSelectedNrc}
              />
            ))}
          </div>
        ))}
      </div>

      <ul className="horario-legend">
        {entries.map((entry) => (
          <li key={entry.nrc} className="horario-legend__item">
            <input
              type="color"
              value={entry.color}
              onChange={(e) => handleColorChange(entry.nrc, e.target.value)}
              className="horario-legend__color"
              title="Cambiar color"
            />
            <span className="horario-legend__label">
              {entry.subjectCourse} · Sec {entry.section}
            </span>
            <button
              type="button"
              className="link-button horario-legend__remove"
              onClick={() => handleRemove(entry.nrc)}
            >
              quitar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
