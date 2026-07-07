// Performs the real CAS (Apereo/Springframework) login handshake used by
// sso.uc.cl on behalf of a user, entirely server-side, and returns the
// JSESSIONID that registration9.uc.cl issues once the ticket is redeemed.
//
// The credentials passed in here are used exactly once, for the single
// fetch() POST below, and are never written to a log, a file, or a
// variable that outlives this function call.

const CAS_LOGIN = 'https://sso.uc.cl/cas/login';
const CAS_SERVICE = 'https://registration9.uc.cl/StudentRegistrationSsb/login/cas';

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

export class CasAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CasAuthError';
  }
}

// Minimal cookie jar: fetch() has no built-in one, and this handshake needs
// cookies to survive across the GET (login page) and POST (submit) to the
// same CAS flow, then across the redirect chain back to registration9.
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

  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  get(name) {
    return this.cookies.get(name);
  }
}

function extractExecution(html) {
  const match = html.match(/name="execution" value="([^"]+)"/);
  if (!match) throw new CasAuthError('Could not find CAS execution token (login page layout may have changed)');
  return match[1];
}

function extractSynchronizerToken(html) {
  const match = html.match(/name="synchronizerToken" content="([^"]+)"/);
  if (!match) return null;
  return match[1];
}

// registration9 may still be behind Cloudflare for some traffic patterns;
// a JSON/normal HTML response is fine, a CF challenge page is not.
function looksLikeCloudflareChallenge(html) {
  return html.includes('Just a moment') || html.includes('cf-browser-verification');
}

export async function loginWithCas(username, password) {
  const jar = new CookieJar();

  const loginPageRes = await fetch(
    `${CAS_LOGIN}?TARGET=${encodeURIComponent(CAS_SERVICE)}`,
    { headers: { 'User-Agent': UA } }
  );
  jar.absorb(loginPageRes);
  const loginPageHtml = await loginPageRes.text();
  const execution = extractExecution(loginPageHtml);

  const body = new URLSearchParams({
    username,
    password,
    execution,
    _eventId: 'submit',
    geolocation: '',
  });

  const submitRes = await fetch(`${CAS_LOGIN}?TARGET=${encodeURIComponent(CAS_SERVICE)}`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
      Cookie: jar.header(),
    },
    body: body.toString(),
  });
  jar.absorb(submitRes);

  if (submitRes.status !== 302) {
    // CAS re-renders the login form (200) with an inline error instead of
    // redirecting when credentials are wrong -- there is no distinct
    // "wrong password" status code to check instead.
    throw new CasAuthError('UC rejected the username or password');
  }

  let nextUrl = submitRes.headers.get('location');
  let jsessionId = null;

  // Follow the CAS ticket redirect back to registration9.uc.cl ourselves
  // (rather than fetch's automatic redirect) so we can read the
  // JSESSIONID cookie off the response that actually sets it.
  for (let hop = 0; hop < 5 && nextUrl; hop++) {
    const res = await fetch(nextUrl, {
      redirect: 'manual',
      headers: { 'User-Agent': UA, Cookie: jar.header() },
    });
    jar.absorb(res);

    if (jar.get('JSESSIONID')) {
      jsessionId = jar.get('JSESSIONID');
    }

    if (res.status >= 300 && res.status < 400) {
      nextUrl = new URL(res.headers.get('location'), nextUrl).toString();
      continue;
    }

    const html = await res.text();
    if (looksLikeCloudflareChallenge(html)) {
      throw new CasAuthError('Blocked by Cloudflare challenge -- an admin needs to refresh cf_clearance manually');
    }
    break;
  }

  if (!jsessionId) {
    throw new CasAuthError('CAS login succeeded but no session was issued by registration9.uc.cl');
  }

  // The synchronizer (CSRF) token is per-session and only appears once
  // authenticated -- it's a <meta name="synchronizerToken"> tag on
  // classSearch, not something CAS hands back directly.
  const classSearchRes = await fetch(
    'https://registration9.uc.cl/StudentRegistrationSsb/ssb/classSearch/classSearch',
    { headers: { 'User-Agent': UA, Cookie: jar.header() } }
  );
  jar.absorb(classSearchRes);
  const classSearchHtml = await classSearchRes.text();
  const synchronizerToken = extractSynchronizerToken(classSearchHtml);

  if (!synchronizerToken) {
    throw new CasAuthError('Logged in, but could not find the session synchronizer token');
  }

  return {
    jsessionId: jar.get('JSESSIONID') ?? jsessionId,
    rbdiCookie: jar.get('RbdI6CHvhzrLAA1Q6g__') ?? null,
    synchronizerToken,
  };
}
