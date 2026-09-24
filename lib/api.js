const API = process.env.NEXT_PUBLIC_API_URL;
const SESSION_BACKEND_URL = process.env.NEXT_PUBLIC_SESSION_BACKEND_URL;
const DATASET_BACKEND_URL = process.env.NEXT_PUBLIC_DATASET_BACKEND_URL;

if (!API && typeof window !== "undefined") {
  // Surface a loud, obvious signal in the console rather than a silent
  // "failed to fetch" with no explanation.
  console.error(
    "NEXT_PUBLIC_API_URL is not set. Set it in Vercel → Project → Settings → Environment Variables."
  );
}

/**
 * The three Render free-tier services behind this demo, keyed by the
 * name the UI shows while warming. Session/dataset backend URLs are
 * optional — the frontend normally never talks to them directly (see
 * the deployment guide, Section 6) — so warming just skips whichever
 * of the two isn't configured, rather than failing.
 */
const WARM_TARGETS = [
  { key: "gateway", label: "Gateway", url: API },
  { key: "session", label: "Session backend", url: SESSION_BACKEND_URL },
  { key: "dataset", label: "Dataset backend", url: DATASET_BACKEND_URL },
].filter((t) => !!t.url);

/**
 * Pings a single service's /health. Every one of the three backends
 * exposes GET /health with no auth (see the deployment guide, Section 6),
 * but only the gateway is configured with CORS for this frontend's
 * origin — the session and dataset backends aren't, since they're only
 * ever meant to be called server-to-server. `mode: "no-cors"` is what
 * makes this safe to call anyway: the browser still sends the request
 * (which is all that's needed to wake a sleeping Render instance), it
 * just returns an opaque response we can't read, so we never depend on
 * its status or body — only on the network round trip completing.
 *
 * Render's free tier can take 30-60s to wake from cold, and the guide
 * notes it can occasionally run over a minute, so the timeout here is
 * generous rather than tight.
 */
async function pingHealth(url, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(`${url.replace(/\/+$/, "")}/health`, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Real (CORS) GET that resolves to parsed JSON only on HTTP 200, else null. */
async function getJsonOk(path, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${path}`, { cache: "no-store", signal: controller.signal });
    if (!res.ok) return null; // Render's 502 "waking up" page lands here
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Wakes the gateway, session backend and dataset backend and only resolves
 * true once each has actually answered with HTTP 200.
 *
 * Why not just ping each with no-cors: an opaque no-cors response looks the
 * same for a healthy service and for Render's 502 "still waking" page, so
 * the old warm-up could report "warm" while a service was still down.
 * Only the gateway allows this site's origin, so:
 *   1. fire no-cors pings at the session/dataset backends immediately, so
 *      all three wake in parallel rather than one after another;
 *   2. poll the gateway's /health until it returns 200;
 *   3. poll the gateway's /health/upstreams until it reports the session
 *      backend (and dataset backend, if configured) reachable. The gateway
 *      checks them server-side, where the status code is readable.
 *
 * onUpdate(key, ok) fires as each service is confirmed. Gives up after
 * `maxMs` and returns false; the caller must not start a session then.
 */
export async function warmBackends(onUpdate, { maxMs = 150000, intervalMs = 4000 } = {}) {
  const deadline = Date.now() + maxMs;
  const done = {};
  const mark = (key, ok) => {
    if (done[key] === ok) return;
    done[key] = ok;
    onUpdate?.(key, ok);
  };

  // (1) parallel wake-up nudges; result deliberately ignored
  for (const t of WARM_TARGETS) if (t.key !== "gateway") pingHealth(t.url, 5000).catch(() => {});

  // (2) gateway
  while (Date.now() < deadline) {
    if (await getJsonOk("/health")) {
      mark("gateway", true);
      break;
    }
    await sleep(intervalMs);
  }
  if (!done.gateway) {
    WARM_TARGETS.forEach((t) => mark(t.key, false));
    return false;
  }

  // (3) upstreams, as seen by the gateway
  while (Date.now() < deadline) {
    const u = await getJsonOk("/health/upstreams", 100000);
    if (u) {
      const sessionOk = u.session_backend === true;
      const datasetOk = u.dataset_backend !== false; // null = check disabled
      if (WARM_TARGETS.some((t) => t.key === "session")) mark("session", sessionOk);
      if (WARM_TARGETS.some((t) => t.key === "dataset")) mark("dataset", datasetOk);
      if (u.mongodb === true && sessionOk && datasetOk) return true;
    }
    await sleep(intervalMs);
  }
  WARM_TARGETS.forEach((t) => {
    if (done[t.key] !== true) mark(t.key, false);
  });
  return false;
}

export function warmTargets() {
  return WARM_TARGETS.map(({ key, label }) => ({ key, label }));
}

/**
 * Starts (or reports the state of) a demo session.
 * Idempotent on the backend: safe to call from several tabs.
 */
export async function startSession() {
  let res;
  try {
    res = await fetch(`${API}/session/start`, { method: "POST" });
  } catch (e) {
    // fetch only throws on network failure or a CORS block
    throw new Error(
      `Could not reach the gateway at ${API}. Check NEXT_PUBLIC_API_URL, and that this site's origin is in the gateway's ALLOWED_ORIGINS.`
    );
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail || `Gateway returned HTTP ${res.status}`);
  }
  return body;
}

/**
 * One status poll. Never throws on a network blip or a sleeping
 * free-tier service — callers should treat `null` as "try again".
 * No client-side timeout: the guide is explicit that the first request
 * after a quiet period can take 30-60s per service while it wakes.
 */
export async function getStatus() {
  try {
    const res = await fetch(`${API}/session/status`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { status: "error", error: body.detail || `HTTP ${res.status}` };
    }
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Polls /session/status every `intervalMs` while a session is in flight
 * (starting or preparing_dataset), calling `onUpdate` with every snapshot
 * (including the transient nulls/502s so the UI can say "waking up…"
 * instead of going blank). Stops on `ready`, `error`, OR a fallback back
 * to `idle` — a start attempt can fail, or a session can idle-shutdown,
 * without ever reporting `error`, and without this the loop would poll
 * forever with no way for the UI to know the attempt is over.
 * Returns a stop() function.
 */
export function pollSession(onUpdate, intervalMs = 4000, { ignoreIdleMs = 0 } = {}) {
  let stopped = false;
  const t0 = Date.now();
  let sawActive = false;

  (async () => {
    while (!stopped) {
      const s = await getStatus();
      if (stopped) return;
      if (s?.status === "starting" || s?.status === "preparing_dataset") sawActive = true;
      // Right after a start click the status can still read "idle" for a
      // moment; don't treat that as a failed start until the grace period
      // has passed (or we've already seen the session go active).
      const idleTooEarly =
        s?.status === "idle" && !sawActive && Date.now() - t0 < ignoreIdleMs;
      if (!idleTooEarly) onUpdate(s);
      if (
        !idleTooEarly &&
        (s?.status === "ready" || s?.status === "error" || s?.status === "idle")
      )
        return;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  })();

  return () => {
    stopped = true;
  };
}

/**
 * Sends a chat question. Distinguishes three outcomes the UI needs to
 * treat differently:
 *  - { answer } on success
 *  - { sessionInactive: true, message } when the gateway reports
 *    session_not_active (HTTP 200, not an error)
 *  - throws for HTTP 502 (model call failed) or 422 (bad question)
 */
export async function sendChat(question) {
  const res = await fetch(`${API}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(body.detail || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }

  if (body.error === "session_not_active") {
    return { sessionInactive: true, message: body.message };
  }

  return { answer: body.answer };
}