"use client";

import { useRef, useState, useEffect } from "react";
import { sendChat } from "../lib/api";

const EXAMPLE_QUESTIONS = [
  "How do I buy tokens?",
  "Why did my power go off?",
  "How do I report a fault?",
];

export default function ChatPanel({ ready, onSessionInactive }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages]);

  async function submit(question) {
    const q = question.trim();
    if (!q || sending || !ready) return;

    setMessages((m) => [...m, { from: "user", text: q }]);
    setInput("");
    setSending(true);

    try {
      const result = await sendChat(q);
      if (result.sessionInactive) {
        setMessages((m) => [
          ...m,
          { from: "system", text: result.message || "The session ended. Start the demo again to keep chatting." },
        ]);
        onSessionInactive?.();
      } else {
        setMessages((m) => [...m, { from: "bot", text: result.answer }]);
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        { from: "system", text: `Couldn't reach the model: ${err.message}` },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="chat" aria-label="Chat">
      <div className="chat-log" ref={logRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            {ready
              ? "Ask about tokens, outages, tariffs, or faults — answers are grounded in Kenya Power's published guidance."
              : "The chat opens once the session is live."}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className="msg" data-from={m.from}>
            {m.text}
          </div>
        ))}
        {sending && (
          <div className="msg" data-from="bot">
            <span className="spinner-dot" aria-hidden="true" />
            thinking…
          </div>
        )}
      </div>

      {ready ? (
        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
        >
          <input
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={EXAMPLE_QUESTIONS[messages.length % EXAMPLE_QUESTIONS.length]}
            maxLength={2000}
            disabled={sending}
            aria-label="Your question"
          />
          <button className="chat-send" type="submit" disabled={sending || !input.trim()}>
            Send
          </button>
        </form>
      ) : (
        <div className="chat-locked">Start the demo above to unlock the chat.</div>
      )}
    </section>
  );
}
