"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import StatusMeter from "../components/StatusMeter";
import ChatPanel from "../components/ChatPanel";
import WarmupPanel from "../components/WarmupPanel";
import { startSession, pollSession, getStatus, warmBackends, warmTargets } from "../lib/api";

const TARGETS = warmTargets();

function initialWarmState() {
  return Object.fromEntries(TARGETS.map((t) => [t.key, "pending"]));
}

export default function Home() {
  const [session, setSession] = useState(null);
  const [starting, setStarting] = useState(false);
  const [startFailedSilently, setStartFailedSilently] = useState(false);
  const [warming, setWarming] = useState(true);
  const [warmState, setWarmState] = useState(initialWarmState);
  const stopPollRef = useRef(null);

  // Pings the gateway, session backend and dataset backend in parallel
  // and waits for all three before resolving — the "warm first" gate
  // referenced everywhere below. Safe to call more than once (e.g. right
  // before starting a demo that's sat idle long enough for Render to
  // put the services back to sleep).
  const ensureWarm = useCallback(async () => {
    setWarming(true);
    setWarmState(initialWarmState());
    await warmBackends((key, ok) => {
      setWarmState((prev) => ({ ...prev, [key]: ok ? "ok" : "timeout" }));
    });
    setWarming(false);
  }, []);

  const beginPolling = useCallback((opts) => {
    stopPollRef.current?.();
    stopPollRef.current = pollSession((s) => {
      setSession(s);
      if (s?.status === "ready" || s?.status === "error") {
        setStarting(false);
        setStartFailedSilently(false);
      } else if (s?.status === "idle") {
        // The backend fell back to idle without ever reporting `error` —
        // most likely the start attempt didn't actually launch a session.
        // Surface that explicitly rather than silently resetting.
        setStarting(false);
        setStartFailedSilently(true);
      }
    }, 4000, opts);
  }, []);

  // On load, warm all three backends first — nothing below is initiated
  // until that settles — then check current state once (in case a
  // session is already running from an earlier visit or another tab)
  // and start polling only if something is actually in flight.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureWarm();
      if (cancelled) return;
      const s = await getStatus();
      if (cancelled) return;
      setSession(s);
      if (s?.status === "starting" || s?.status === "preparing_dataset") {
        setStarting(true);
        beginPolling();
      }
    })();
    return () => {
      cancelled = true;
      stopPollRef.current?.();
    };
  }, [beginPolling, ensureWarm]);

  async function handleStart() {
    setStarting(true);
    setStartFailedSilently(false);
    try {
      // Re-warm before starting: the page may have sat open long enough
      // for the free-tier services to fall asleep again.
      await ensureWarm();
      const started = await startSession();
      if (started?.status) setSession(started);
      if (started?.status === "ready") {
        setStarting(false);
        return;
      }
      beginPolling({ ignoreIdleMs: 20000 });
    } catch (e) {
      // Show the real reason instead of a vague "didn't take".
      setSession({ status: "error", error: e.message });
      setStarting(false);
    }
  }

  function handleSessionInactive() {
    setSession({ status: "idle" });
  }

  const ready = session?.status === "ready";

  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">
          <div className="brand-name">KPLC Chatbot</div>
          <div className="brand-sub">retrieval-grounded · self-hosted GPU demo</div>
        </div>
        <span
          className="chip"
          data-tone={
            warming ? undefined : ready ? "live" : session?.status === "error" ? "alert" : session?.status ? "current" : undefined
          }
        >
          {warming
            ? "● warming up"
            : ready
            ? "● live"
            : session?.status === "error"
            ? "● error"
            : session?.status
            ? `● ${session.status}`
            : "● checking…"}
        </span>
      </div>

      <WarmupPanel targets={TARGETS} warmState={warmState} warming={warming} />

      <StatusMeter
        session={session}
        onStart={handleStart}
        starting={starting || warming}
        startFailedSilently={startFailedSilently}
      />

      <ChatPanel ready={ready && !warming} onSessionInactive={handleSessionInactive} />

      <details className="about">
        <summary>How this demo is built</summary>
        <div className="about-body">
          <p>
            This page talks only to a small gateway service, which retrieves the most
            relevant knowledge chunks from MongoDB Atlas and asks the model for an
            answer. The model itself — <code>Qwen3-4B-Instruct-2507</code> — isn&apos;t
            always on: it runs on a free Kaggle GPU notebook that this page starts on
            demand, reached through a Cloudflare Tunnel.
          </p>
          <p>
            That trade-off is deliberate. Kaggle&apos;s GPU quota is limited and shared,
            so rather than pretending this is an always-on service, the lifecycle above
            is shown honestly: standby, boot, live, and — after 15 minutes without a
            question — back to standby.
          </p>
        </div>
      </details>

      <footer className="foot">gateway status is polled every few seconds while a session is starting</footer>
    </main>
  );
}