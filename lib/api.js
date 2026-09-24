const API = process.env.NEXT_PUBLIC_API_URL;

if (!API && typeof window !== "undefined") {
  // Surface a loud, obvious signal in the console rather than a silent
  // "failed to fetch" with no explanation.
  console.error(
    "NEXT_PUBLIC_API_URL is not set. Set it in Vercel → Project → Settings → Environment Variables."
  );
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
