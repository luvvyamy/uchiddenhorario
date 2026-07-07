// Best-effort GUESS for whether a meeting block is a real weekly class or
// a one-off assessment (Interrogación N, Examen). Course-specific meeting
// type codes (INT1, INT2, INT3...) mean there's no fixed list of "exam"
// codes to check against, so this only sets a default -- the user always
// gets to override it per block before adding to their horario.
//
// Signature observed in real UC data: genuine weekly classes run only
// across the actual teaching weeks (~13-17 weeks), while one-off
// assessments get a placeholder range spanning basically the whole term
// (~4-5 months) because Banner doesn't track their real single date here.
function parseUsDate(mmddyyyy) {
  const [month, day, year] = mmddyyyy.split('/').map(Number);
  return new Date(year, month - 1, day);
}

const ONE_OFF_MIN_SPAN_DAYS = 120;

export function looksLikeOneOff(block) {
  if (!block.startDate || !block.endDate) return false;
  const start = parseUsDate(block.startDate);
  const end = parseUsDate(block.endDate);
  const spanDays = (end - start) / (1000 * 60 * 60 * 24);
  return spanDays >= ONE_OFF_MIN_SPAN_DAYS;
}
