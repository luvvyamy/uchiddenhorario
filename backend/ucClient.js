const BASE = 'https://registration9.uc.cl/StudentRegistrationSsb/ssb';

const UNIQUE_SESSION_ID = `nwsef${Date.now()}`;

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  absorb(res) {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';');
      const eq = pair.indexOf('=');
      if (eq === -1) continue;
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  toSession() {
    return {
      cookies: Object.fromEntries(this.cookies.entries()),
      jsessionId: this.cookies.get('JSESSIONID') ?? null,
      rbdiCookie: this.cookies.get('RbdI6CHvhzrLAA1Q6g__') ?? null,
      synchronizerToken: null,
      anonymous: true,
    };
  }
}

function buildCookieHeader(session) {
  if (session.cookies) {
    return Object.entries(session.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  const parts = [];
  if (session.jsessionId) parts.push(`JSESSIONID=${session.jsessionId}`);
  if (session.rbdiCookie) parts.push(`RbdI6CHvhzrLAA1Q6g__=${session.rbdiCookie}`);
  return parts.join('; ');
}

function commonHeaders(session, extra = {}) {
  return {
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9,es-CL;q=0.8,es;q=0.7',
    'Cache-Control': 'no-cache',
    Cookie: buildCookieHeader(session),
    Pragma: 'no-cache',
    Referer: `${BASE}/classSearch/classSearch`,
    'User-Agent':
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'X-Synchronizer-Token': session.synchronizerToken ?? '',
    ...extra,
  };
}

export async function createAnonymousUcSession() {
  const jar = new CookieJar();

  const termSelectionRes = await fetch(`${BASE}/term/termSelection?mode=search`, {
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    },
  });
  jar.absorb(termSelectionRes);
  await termSelectionRes.text();

  const classSearchRes = await fetch(`${BASE}/classSearch/classSearch`, {
    redirect: 'follow',
    headers: {
      Cookie: jar.toSession().cookies ? buildCookieHeader(jar.toSession()) : '',
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    },
  });
  jar.absorb(classSearchRes);
  await classSearchRes.text();

  const session = jar.toSession();
  if (!session.jsessionId) {
    throw new AuthExpiredError();
  }
  return session;
}

// UC's searchResults endpoint keeps server-side search-form state across
// calls within the same session -- filters from a previous search silently
// linger unless resetDataForm is called first, or a later search that
// omits a filter still gets the earlier filter's results. Discovered by
// testing filters back-to-back and seeing stale results until this was
// added before every search.
async function resetSearchForm(session) {
  await fetch(`${BASE}/classSearch/resetDataForm`, {
    headers: commonHeaders(session),
  });
}

// UC session tracks "which term" server-side, separate from the JSESSIONID.
// A stale/never-set term makes searchResults come back empty, so every
// search call re-selects the term first. Cheap and avoids a hidden bug
// where the first search of a session used the wrong term.
async function selectTerm(term, session) {
  const res = await fetch(`${BASE}/term/search?mode=search`, {
    method: 'POST',
    headers: commonHeaders(session, {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Origin: 'https://registration9.uc.cl',
      Referer: `${BASE}/term/termSelection?mode=search`,
    }),
    body: new URLSearchParams({
      term,
      studyPath: '',
      studyPathText: '',
      startDatepicker: '',
      endDatepicker: '',
      uniqueSessionId: UNIQUE_SESSION_ID,
    }).toString(),
  });

  if (!isAuthenticated(res)) {
    throw new AuthExpiredError();
  }
  return res.json();
}

class AuthExpiredError extends Error {
  constructor() {
    super('UC session expired or invalid (cookies need refreshing)');
    this.name = 'AuthExpiredError';
  }
}

// Banner redirects to the login/error page (HTML, 200) instead of a 401
// when the session is dead, so status code alone can't detect it --
// check the content-type of what came back.
function isAuthenticated(res) {
  const contentType = res.headers.get('content-type') ?? '';
  return contentType.includes('application/json') || contentType.includes('javascript');
}

function decodeHtmlEntities(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&aacute;/g, 'á')
    .replace(/&eacute;/g, 'é')
    .replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó')
    .replace(/&uacute;/g, 'ú')
    .replace(/&ntilde;/g, 'ñ')
    .replace(/&Aacute;/g, 'Á')
    .replace(/&Eacute;/g, 'É')
    .replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó')
    .replace(/&Uacute;/g, 'Ú')
    .replace(/&Ntilde;/g, 'Ñ')
    .replace(/&amp;/g, '&');
}

function cleanFacultyName(displayName) {
  if (!displayName) return null;
  // Banner format: "Lastname1|Lastname2, Firstname" -> "Firstname Lastname1 Lastname2"
  const [lastNames, firstNames] = displayName.split(',').map((s) => s.trim());
  if (!firstNames) return decodeHtmlEntities(lastNames ?? displayName);
  return decodeHtmlEntities(`${firstNames} ${lastNames.replace(/\|/g, ' ')}`);
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function formatTime(hhmm) {
  if (!hhmm || hhmm.length !== 4) return null;
  return `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
}

// Which meeting-type codes are one-off assessments (Interrogación N, exams)
// vs genuine weekly classes is course-specific -- some courses go up to
// INT3/INT4, and there's no fixed list Banner exposes. So the backend no
// longer guesses: it hands back every meeting block as-is (with its raw
// type, description, and date range), and the frontend lets the user
// decide per block what belongs on their weekly grid.
function normalizeSection(raw) {
  const meetings = (raw.meetingsFaculty ?? [])
    .map((m) => m.meetingTime)
    .filter(Boolean)
    .map((mt) => ({
      type: mt.meetingType,
      typeDescription: decodeHtmlEntities(mt.meetingTypeDescription),
      beginTime: formatTime(mt.beginTime),
      endTime: formatTime(mt.endTime),
      days: DAYS.filter((d) => mt[d]),
      building: mt.buildingDescription ? decodeHtmlEntities(mt.buildingDescription) : null,
      room: mt.room && mt.room !== 'SIN SALA' ? mt.room : null,
      startDate: mt.startDate,
      endDate: mt.endDate,
    }));

  return {
    nrc: raw.courseReferenceNumber,
    subjectCourse: raw.subjectCourse,
    title: decodeHtmlEntities(raw.courseTitle),
    section: raw.sequenceNumber,
    credits: raw.creditHours,
    campus: decodeHtmlEntities(raw.campusDescription),
    instructionalMethod: decodeHtmlEntities(raw.instructionalMethodDescription),
    seatsAvailable: raw.seatsAvailable,
    maximumEnrollment: raw.maximumEnrollment,
    enrollment: raw.enrollment,
    waitAvailable: raw.waitAvailable,
    waitCapacity: raw.waitCapacity,
    isOpen: raw.openSection,
    instructors: (raw.faculty ?? []).map((f) => ({
      name: cleanFacultyName(f.displayName),
      email: f.emailAddress,
    })),
    meetings,
  };
}

// UC's search actually honors these as query params on searchResults (all
// verified live, several rounds -- some only after realizing stale
// server-side form state needed resetDataForm between attempts):
//   txt_subjectcoursecombo, txt_subject, txt_courseNumber, txt_instructor,
//   txt_instructionalMethod, txt_college, txt_campus, txt_attribute,
//   txt_partOfTerm, chk_open_only, chk_include_{0-6} (day of week, 0=Sunday
//   per Banner's firstDayOfTheWeek config), select_start_/end_hour/min/ampm.
//
// txt_courseTitle, txt_keywordany, txt_keywordlike, txt_credithourlow, and
// txt_credithourhigh are real form fields but don't filter server-side
// (verified live -- results came back identical to unfiltered regardless
// of value). They're deliberately NOT supported here: correctly filtering
// by them would require fetching every section in the term instead of one
// page, which is too expensive to do on every search.
function buildSearchParams({ subjectCourse, term, pageOffset, pageMaxSize, filters }) {
  const params = new URLSearchParams({
    txt_term: term,
    startDatepicker: '',
    endDatepicker: '',
    uniqueSessionId: UNIQUE_SESSION_ID,
    pageOffset: String(pageOffset),
    pageMaxSize: String(pageMaxSize),
    sortColumn: 'subjectDescription',
    sortDirection: 'asc',
  });

  if (subjectCourse) params.set('txt_subjectcoursecombo', subjectCourse);
  if (filters.subject) params.set('txt_subject', filters.subject);
  if (filters.courseNumber) params.set('txt_courseNumber', filters.courseNumber);
  if (filters.instructor) params.set('txt_instructor', filters.instructor);
  if (filters.instructionalMethod) params.set('txt_instructionalMethod', filters.instructionalMethod);
  if (filters.college) params.set('txt_college', filters.college);
  if (filters.campus) params.set('txt_campus', filters.campus);
  if (filters.attribute) params.set('txt_attribute', filters.attribute);
  if (filters.partOfTerm) params.set('txt_partOfTerm', filters.partOfTerm);
  if (filters.openOnly) params.set('chk_open_only', 'true');

  for (const dow of filters.daysOfWeek ?? []) {
    params.set(`chk_include_${dow}`, 'true');
  }

  if (filters.startTime) {
    const { hour, min, ampm } = filters.startTime;
    params.set('select_start_hour', hour);
    params.set('select_start_min', min);
    params.set('select_start_ampm', ampm);
  }
  if (filters.endTime) {
    const { hour, min, ampm } = filters.endTime;
    params.set('select_end_hour', hour);
    params.set('select_end_min', min);
    params.set('select_end_ampm', ampm);
  }

  return params;
}

export async function searchCourse({
  subjectCourse,
  term,
  pageOffset = 0,
  pageMaxSize = 20,
  session,
  filters = {},
}) {
  if (!session) {
    throw new AuthExpiredError();
  }
  await resetSearchForm(session);
  await selectTerm(term, session);

  const params = buildSearchParams({ subjectCourse, term, pageOffset, pageMaxSize, filters });

  const res = await fetch(`${BASE}/searchResults/searchResults?${params.toString()}`, {
    headers: commonHeaders(session),
  });

  if (!isAuthenticated(res)) {
    throw new AuthExpiredError();
  }

  const json = await res.json();
  const sections = (json.data ?? []).map(normalizeSection);

  return {
    success: json.success ?? false,
    totalCount: json.totalCount ?? sections.length,
    sections,
  };
}

const CACHEABLE_LOOKUPS = {
  attribute: 'get_attribute',
  partOfTerm: 'get_partOfTerm',
  campus: 'get_campus',
  instructionalMethod: 'get_instructionalMethod',
  college: 'get_college',
  subject: 'get_subject',
};

// These are small, closed catalogs (a few dozen to ~250 entries) that
// don't change within a term, unlike get_instructor/get_subjectcoursecombo
// which are large, paginated, and meant to be searched live. Cached per
// term since nothing confirms they're identical across terms.
const lookupCache = new Map();

async function fetchLookup(endpoint, term, session) {
  const params = new URLSearchParams({
    searchTerm: '',
    term,
    offset: '1',
    max: '1000',
    uniqueSessionId: UNIQUE_SESSION_ID,
  });
  const res = await fetch(`${BASE}/classSearch/${endpoint}?${params.toString()}`, {
    headers: commonHeaders(session),
  });

  if (!isAuthenticated(res)) {
    throw new AuthExpiredError();
  }

  const json = await res.json();
  return json.map((item) => ({
    code: item.code,
    description: decodeHtmlEntities(item.description),
  }));
}

export async function getFilterOptions(term, session) {
  if (!session) {
    throw new AuthExpiredError();
  }

  const cacheKey = term;
  if (lookupCache.has(cacheKey)) {
    return lookupCache.get(cacheKey);
  }

  const entries = await Promise.all(
    Object.entries(CACHEABLE_LOOKUPS).map(async ([key, endpoint]) => [
      key,
      await fetchLookup(endpoint, term, session),
    ])
  );
  const options = Object.fromEntries(entries);
  lookupCache.set(cacheKey, options);
  return options;
}

// get_instructor is a large, paginated, live-searched catalog (thousands
// of instructors), unlike the small closed lists in CACHEABLE_LOOKUPS --
// never cache the full set, always query with the user's actual search term.
export async function searchInstructors(query, term, session) {
  if (!session) {
    throw new AuthExpiredError();
  }

  const params = new URLSearchParams({
    searchTerm: query,
    term,
    offset: '1',
    max: '10',
    uniqueSessionId: UNIQUE_SESSION_ID,
  });
  const res = await fetch(`${BASE}/classSearch/get_instructor?${params.toString()}`, {
    headers: commonHeaders(session),
  });
  if (!isAuthenticated(res)) {
    throw new AuthExpiredError();
  }
  const json = await res.json();
  return json.map((item) => ({ code: item.code, description: decodeHtmlEntities(item.description) }));
}

// txt_subjectcoursecombo (the "Sigla" field) only matches a COMPLETE sigla
// exactly -- searching "IIC" or "IIC3" against searchResults itself
// returns zero results, it's not a prefix search. get_subjectcoursecombo
// is the actual autocomplete Banner's own UI calls as you type, and it
// DOES prefix-match ("IIC3" -> IIC3103, IIC3104, ...), so partial sigla
// input has to go through this instead of straight to search.
export async function searchSubjectCourseCombos(query, term, session) {
  if (!session) {
    throw new AuthExpiredError();
  }

  const params = new URLSearchParams({
    searchTerm: query,
    term,
    offset: '1',
    max: '15',
    uniqueSessionId: UNIQUE_SESSION_ID,
  });
  const res = await fetch(`${BASE}/classSearch/get_subjectcoursecombo?${params.toString()}`, {
    headers: commonHeaders(session),
  });
  if (!isAuthenticated(res)) {
    throw new AuthExpiredError();
  }
  const json = await res.json();
  return json.map((item) => ({ code: item.code, description: decodeHtmlEntities(item.description) }));
}

export { AuthExpiredError };
