"use client";

import { useEffect, useState } from "react";

const BASE_STEPS = [
  { key: "idle", label: "Standby" },
  { key: "starting", label: "Booting" },
  { key: "ready", label: "Live" },
];

const STATUS_COPY = {
  idle: "Assistant is off",
  preparing_dataset: "Preparing model files",
  starting: "Booting the GPU session",
  ready: "Assistant is live",
  error: "Session failed",
  waking: "Waking the service",
};

function stepState(stepKey, currentStatus, order) {
  const currentIndex = order.indexOf(currentStatus === "waking" ? "idle" : currentStatus);
  const stepIndex = order.indexOf(stepKey);
  if (currentStatus === "error") return stepIndex === 0 ? "alert" : "done";
  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex) return stepKey === "ready" ? "live" : "active";
  return "";
}

function useElapsed(startedAt, active) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, [active]);
  if (!startedAt) return null;
  const secs = Math.max(0, Math.round(now - startedAt));
  const m = String(Math.floor(secs / 60)).padStart(2, "0");
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function StatusMeter({ session, onStart, starting, startFailedSilently }) {
  const status = session?.status || (starting ? "waking" : "idle");
  const showPrep = status === "preparing_dataset";
  const steps = showPrep
    ? [BASE_STEPS[0], { key: "preparing_dataset", label: "Preparing" }, ...BASE_STEPS.slice(1)]
    : BASE_STEPS;
  const order = steps.map((s) => s.key);

  const elapsed = useElapsed(
    session?.started_at,
    status === "starting" || status === "preparing_dataset"
  );

  const canStart = status === "idle" || status === "error";
  const isBusy = status === "starting" || status === "preparing_dataset" || status === "waking";

  return (
    <section className="meter" aria-label="Session status" role="status">
      <div className="meter-track">
        {steps.map((step, idx) => (
          <div key={step.key} className="meter-seg" style={{ "--i": idx }} data-state={stepState(step.key, status, order)} />
        ))}
      </div>
      <div className="meter-labels">
        {steps.map((step) => (
          <span key={step.key} data-current={order[order.indexOf(status === "waking" ? "idle" : status)] === step.key}>
            {step.label}
          </span>
        ))}
      </div>

      <div className="meter-readout">
        <div>
          <div className="meter-status-text">
            {isBusy && <span className="spinner-dot" aria-hidden="true" />}
            {STATUS_COPY[status] || status}
          </div>
          <div className="meter-status-detail">
            {status === "idle" && !startFailedSilently &&
              "Runs on a free Kaggle GPU, started on demand — boot takes about a minute or two."}
            {status === "idle" && startFailedSilently &&
              "The last start attempt didn't take — the session never left idle. Worth checking the session backend is awake, then try again."}
            {status === "waking" && "Contacting the gateway — a sleeping free-tier service can take up to a minute to answer."}
            {status === "preparing_dataset" &&
              "First run only: copying the model weights into Kaggle. This can take a while — feel free to leave the tab open."}
            {status === "starting" && "Loading Qwen3-4B-Instruct-2507 and opening the tunnel…"}
            {status === "ready" && "Ask a question below. The session ends itself after 15 minutes idle."}
            {status === "error" && "See the detail below, then try again."}
          </div>
        </div>
        {elapsed && (isBusy || status === "ready") && (
          <div className="meter-digits" aria-label="Elapsed time">
            {elapsed}
          </div>
        )}
      </div>

      {status === "error" && session?.error && (
        <div className="meter-error">{session.error}</div>
      )}

      {canStart && (
        <button className="start-btn" onClick={onStart} disabled={starting}>
          {status === "error" ? "Retry demo" : "Start demo"}
        </button>
      )}
    </section>
  );
}
