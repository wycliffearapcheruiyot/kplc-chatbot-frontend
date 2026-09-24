> **Part of the [KPLC Chatbot System](https://github.com/wycliffearapcheruiyot/kplc-chatbot-system).**
> This repo: Next.js chatbot UI (end users talk to this)
> Sibling repos: [kplc-chatbot-admin](https://github.com/wycliffearapcheruiyot/kplc-chatbot-admin), [kplc-chatbot-gateway](https://github.com/wycliffearapcheruiyot/kplc-chatbot-gateway), [kplc-chatbot-inference](https://github.com/wycliffearapcheruiyot/kplc-chatbot-inference), [kplc-chatbot-dataset-sync](https://github.com/wycliffearapcheruiyot/kplc-chatbot-dataset-sync), [kplc-chatbot-kb-builder](https://github.com/wycliffearapcheruiyot/kplc-chatbot-kb-builder), [kplc-chatbot-db-infra](https://github.com/wycliffearapcheruiyot/kplc-chatbot-db-infra)

# KPLC Chatbot — Next.js frontend

The public chat window + session-control dashboard described in Section 8 of
the deployment guide. Talks only to the gateway service, via
`NEXT_PUBLIC_API_URL`.

## What it does

- Shows the session lifecycle (`idle → preparing_dataset → starting → ready`,
  or `error`) as a meter, polling `GET /session/status` every 4s while a
  session is starting.
- "Start demo" calls `POST /session/start`.
- Once `ready`, unlocks a chat box that calls `POST /chat`. A
  `session_not_active` response drops the UI back to idle instead of
  showing it as an error.
- No client-side fetch timeouts — Render free-tier services can take
  30–60s to wake, and the guide is explicit that a `502` while polling
  usually just means that, not a real failure.

## Local development

`.env.local` is already checked in here with the real gateway URL
(`https://kplc-chatbot-gateway.onrender.com`) — it's a public value, not a
secret, so that's fine. Just:

```bash
npm install
npm run dev
```

## Deploying

1. **Push to GitHub.**
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Next.js chatbot frontend"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
2. **Import into Vercel.** vercel.com → "Add New… → Project" → select the
   repo. Vercel auto-detects Next.js — accept the defaults.
3. **Set the environment variable.** Project → Settings → Environment
   Variables → add:
   ```
   NEXT_PUBLIC_API_URL = https://kplc-chatbot-gateway.onrender.com
   ```
   for all environments (Production, Preview, Development). `.env.local`
   is git-ignored, so Vercel won't pick it up automatically — this step is
   required even though the value is already in this repo locally. Redeploy
   if you add it after the first deploy.
4. **Allow the new origin on the gateway.** Copy the resulting `*.vercel.app`
   URL (and your custom domain, if you add one) into `ALLOWED_ORIGINS` on
   `kplc-chatbot-gateway`'s Render service, and redeploy it. Preview deploys
   get their own URL each time — add those too if you need previews to work,
   or just test against the production URL.

## Notes

- `NEXT_PUBLIC_API_URL` is intentionally public — it's just the gateway's
  address, the one thing this page is allowed to call. Don't reuse this
  pattern for the admin panel's `ADMIN_TOKEN`; that one must never be a
  `NEXT_PUBLIC_`/build-time variable, since Next.js inlines those into the
  shipped JavaScript.
- The idle/15-minute clock lives on the Kaggle notebook, not in this page —
  closing the tab doesn't end the session early, and reopening it will pick
  up whatever state the gateway currently reports.
