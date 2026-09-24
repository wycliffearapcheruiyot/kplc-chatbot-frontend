"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import StatusMeter from "../components/StatusMeter";
import ChatPanel from "../components/ChatPanel";
import { startSession, pollSession, getStatus } from "../lib/api";

export default function Home() {
  const [session, setSession] = useState(null);
  const [starting, setStarting] = useState(false);
  const stopPollRef = useRef(null);

  const beginPolling = useCallback(() => {
    stopPollRef.current?.();
    stopPollRef.current = pollSession((s) => {
      setSession(s);
      if (s?.status === "ready" || s?.status === "error") setStarting(false);
    });
  }, []);

  // On load, check current state once (in case a session is already
  // running from an earlier visit or another tab) and start polling
  // only if something is actually in flight.
  useEffect(() => {
    let cancelled = false;
    (async () => {
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
  }, [beginPolling]);

  async function handleStart() {
    setStarting(true);
    await startSession();
    beginPolling();
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
          data-tone={ready ? "live" : session?.status === "error" ? "alert" : session?.status ? "current" : undefined}
        >
          {ready ? "● live" : session?.status === "error" ? "● error" : session?.status ? `● ${session.status}` : "● checking…"}
        </span>
      </div>

      <StatusMeter session={session} onStart={handleStart} starting={starting} />

      <ChatPanel ready={ready} onSessionInactive={handleSessionInactive} />

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
