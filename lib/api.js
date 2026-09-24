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

/**
 * Warms the gateway, session backend and dataset backend at the same
 * time, rather than letting the app wake them one after another as it
 * happens to touch each one. That sequential stacking is called out as
 * a known cost in the deployment guide (Section 1): "the first request
 * can wake the gateway, then the session backend, then the dataset
 * backend, one after another." Pinging all three in parallel up front
 * means that wait happens once, in the background, before the demo
 * asks anything of them.
 *
 * `onUpdate(key, ok)` fires as each ping settles, so the UI can show
 * per-service progress. Best-effort throughout: a timed-out ping is
 * reported as `false` but never throws — the caller proceeds either
 * way, since the worst case is just that the *next* real request has
 * to wait out the rest of a cold start, same as today.
 */
export async function warmBackends(onUpdate) {
  const results = await Promise.all(
    WARM_TARGETS.map(async (t) => {
      const ok = await pingHealth(t.url);
      onUpdate?.(t.key, ok);
      return ok;
    })
  );
  return results.every(Boolean);
}

export function warmTargets() {
  return WARM_TARGETS.map(({ key, label }) => ({ key, label }));
}

/**
 * Starts (or reports the state of) a demo session.
 * Idempotent on the backend: safe to call from several tabs.
 */
export async function startSession() {
  const res = await fetch(`${API}/session/start`, { method: "POST" });
  return res.json();
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
export function pollSession(onUpdate, intervalMs = 4000) {
  let stopped = false;

  (async () => {
    while (!stopped) {
      const s = await getStatus();
      if (stopped) return;
      onUpdate(s);
      if (s?.status === "ready" || s?.status === "error" || s?.status === "idle") return;
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
