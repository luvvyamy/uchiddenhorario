import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { searchCourse, getFilterOptions, searchInstructors, AuthExpiredError } from './ucClient.js';
import { loginWithCas, CasAuthError } from './casClient.js';

const app = express();

// In-memory only: maps an opaque bearer token we hand the frontend to the
// UC session (JSESSIONID etc.) obtained via CAS login. Never touches disk,
// gone on restart, expires on its own well before Banner's own session does.
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;
const sessions = new Map();

function createSession(ucSession) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { ucSession, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function getSession(token) {
  const entry = sessions.get(token);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return entry.ucSession;
}

setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of sessions) {
    if (entry.expiresAt < now) sessions.delete(token);
  }
}, 15 * 60 * 1000).unref();

const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim());

// Vite bumps to 5174/5175/... whenever the previous port is still taken by
// a stale dev server, so pin the allowlist to localhost/127.0.0.1 on any
// port during local dev instead of one exact origin.
const localDevOrigin = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/;

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || localDevOrigin.test(origin)) {
        return callback(null, true);
      }
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
  })
);
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  try {
    const ucSession = await loginWithCas(username, password);
    const token = createSession(ucSession);
    res.json({ token, expiresInMs: SESSION_TTL_MS });
  } catch (err) {
    if (err instanceof CasAuthError) {
      return res.status(401).json({ error: 'cas_auth_failed', message: err.message });
    }
    console.error(err);
    res.status(502).json({ error: 'upstream_error', message: 'Failed to reach UC login' });
  }
  // `password` goes out of scope here; nothing above retained it beyond
  // the loginWithCas() call.
});

function requireSession(req, res, next) {
  const authHeader = req.get('Authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!bearerToken) {
    return res.status(401).json({ error: 'login_required', message: 'Please log in with your UC account' });
  }

  const session = getSession(bearerToken);
  if (!session) {
    return res.status(401).json({ error: 'session_expired', message: 'Please log in again' });
  }

  req.ucSession = session;
  next();
}

function handleUcError(res, err) {
  if (err instanceof AuthExpiredError) {
    return res.status(401).json({ error: 'auth_expired', message: err.message });
  }
  console.error(err);
  res.status(502).json({ error: 'upstream_error', message: 'Failed to reach UC registration' });
}

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function parseTimeParam(hour, min, ampm) {
  if (!hour || !min || !ampm) return null;
  return { hour, min, ampm };
}

app.get('/api/search', requireSession, async (req, res) => {
  const { subjectCourse, term, ...q } = req.query;

  if (!term) {
    return res.status(400).json({ error: 'term is required' });
  }

  const daysOfWeek = DAY_KEYS.map((day, i) => (q[`day_${day}`] === 'true' ? i : null)).filter((i) => i !== null);

  const filters = {
    subject: q.subject ? String(q.subject).toUpperCase() : undefined,
    courseNumber: q.courseNumber ? String(q.courseNumber) : undefined,
    instructor: q.instructor ? String(q.instructor) : undefined,
    instructionalMethod: q.instructionalMethod ? String(q.instructionalMethod) : undefined,
    college: q.college ? String(q.college) : undefined,
    campus: q.campus ? String(q.campus) : undefined,
    attribute: q.attribute ? String(q.attribute) : undefined,
    partOfTerm: q.partOfTerm ? String(q.partOfTerm) : undefined,
    openOnly: q.openOnly === 'true',
    daysOfWeek: daysOfWeek.length > 0 ? daysOfWeek : undefined,
    startTime: parseTimeParam(q.startHour, q.startMin, q.startAmpm),
    endTime: parseTimeParam(q.endHour, q.endMin, q.endAmpm),
  };

  try {
    const result = await searchCourse({
      subjectCourse: subjectCourse ? String(subjectCourse).toUpperCase() : undefined,
      term: String(term),
      session: req.ucSession,
      filters,
    });
    res.json(result);
  } catch (err) {
    handleUcError(res, err);
  }
});

app.get('/api/filters', requireSession, async (req, res) => {
  const { term } = req.query;
  if (!term) {
    return res.status(400).json({ error: 'term is required' });
  }

  try {
    const options = await getFilterOptions(String(term), req.ucSession);
    res.json(options);
  } catch (err) {
    handleUcError(res, err);
  }
});

app.get('/api/instructors', requireSession, async (req, res) => {
  const { term, q } = req.query;
  if (!term) {
    return res.status(400).json({ error: 'term is required' });
  }

  try {
    const results = await searchInstructors(q ? String(q) : '', String(term), req.ucSession);
    res.json(results);
  } catch (err) {
    handleUcError(res, err);
  }
});

const port = process.env.PORT ?? 8787;
app.listen(port, () => {
  console.log(`uchiddenhorario backend listening on :${port}`);
});
