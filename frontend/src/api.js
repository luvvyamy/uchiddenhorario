const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

export class AuthExpiredError extends Error {}

export async function createAnonymousSession() {
  const res = await fetch(`${API_BASE}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Anonymous session failed (${res.status})`);
  }
  return res.json(); // { token, expiresInMs }
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function authedGet(path, token) {
  return fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

async function handleResponse(res, authExpiredMessage) {
  if (res.status === 401) {
    throw new AuthExpiredError(authExpiredMessage);
  }
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }
  return res.json();
}

export async function searchCourse(subjectCourse, term, token, filters = {}) {
  const params = new URLSearchParams({ term });
  if (subjectCourse) params.set('subjectCourse', subjectCourse);

  if (filters.subject) params.set('subject', filters.subject);
  if (filters.courseNumber) params.set('courseNumber', filters.courseNumber);
  if (filters.instructor) params.set('instructor', filters.instructor);
  if (filters.instructionalMethod) params.set('instructionalMethod', filters.instructionalMethod);
  if (filters.college) params.set('college', filters.college);
  if (filters.campus) params.set('campus', filters.campus);
  if (filters.attribute) params.set('attribute', filters.attribute);
  if (filters.partOfTerm) params.set('partOfTerm', filters.partOfTerm);
  if (filters.openOnly) params.set('openOnly', 'true');

  for (const day of filters.daysOfWeek ?? []) {
    params.set(`day_${DAY_NAMES[day]}`, 'true');
  }

  if (filters.startTime) {
    params.set('startHour', filters.startTime.hour);
    params.set('startMin', filters.startTime.min);
    params.set('startAmpm', filters.startTime.ampm);
  }
  if (filters.endTime) {
    params.set('endHour', filters.endTime.hour);
    params.set('endMin', filters.endTime.min);
    params.set('endAmpm', filters.endTime.ampm);
  }

  const res = await authedGet(`/api/search?${params.toString()}`, token);
  return handleResponse(res, 'Tu sesión de búsqueda expiró, se creará una nueva.');
}

export async function getFilterOptions(term, token) {
  const res = await authedGet(`/api/filters?${new URLSearchParams({ term })}`, token);
  return handleResponse(res, 'Tu sesión de búsqueda expiró, se creará una nueva.');
}

export async function searchInstructors(query, term, token) {
  const res = await authedGet(`/api/instructors?${new URLSearchParams({ term, q: query })}`, token);
  return handleResponse(res, 'Tu sesión de búsqueda expiró, se creará una nueva.');
}

export async function searchSubjectCourseCombos(query, term, token) {
  const res = await authedGet(`/api/subject-course-combos?${new URLSearchParams({ term, q: query })}`, token);
  return handleResponse(res, 'Tu sesión de búsqueda expiró, se creará una nueva.');
}
