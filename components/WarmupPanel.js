"use client";

// Shows the three free-tier Render services being woken in parallel
// before anything else on the page is allowed to happen. Renders
// nothing once warm-up has finished and every service answered —
// the normal path most of the time, once nothing has actually been
// asleep. If one or more timed out, a compact summary stays visible
// so it's clear a later action might still be waiting on a slow
// cold start rather than something being broken.
export default function WarmupPanel({ targets, warmState, warming }) {
  if (!targets.length) return null;

  const anyTimedOut = targets.some((t) => warmState[t.key] === "timeout");
  if (!warming && !anyTimedOut) return null;

  return (
    <section className="warmup" aria-label="Backend warm-up status">
      <div className="warmup-title">
        {warming ? "Waking the backend services…" : "One or more services responded slowly"}
      </div>
      <ul className="warmup-list">
        {targets.map((t) => {
          const state = warmState[t.key] || "pending";
          return (
            <li key={t.key} className="warmup-item" data-state={state}>
              <span className="warmup-dot" aria-hidden="true" />
              <span className="warmup-label">{t.label}</span>
              <span className="warmup-state">
                {state === "ok" ? "warm" : state === "timeout" ? "slow to respond" : "waking…"}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="warmup-detail">
        Render's free tier sleeps each service after ~15 idle minutes; the first
        request back can take 30–60s. Pinging all three at once here avoids
        waking them one after another later.
      </div>
    </section>
  );
}
