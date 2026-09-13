# Prompt Forge

A single-user prompt workbench. Two modes:

- **Optimizer** — takes a rough idea and rebuilds it into a full engineered prompt (role, context, constraints, output format, edge cases). Output is usually much longer than the input.
- **Polisher** — takes a prompt you already wrote and cleans it up without changing what it asks for. Output stays close to the original length and voice.

Next.js (App Router) + TypeScript + Tailwind. No database, no auth, no accounts. History lives in your browser's localStorage.

## Setup

Requires Node 18.17+.

```bash
npm install
cp .env.example .env.local
```

Fill in the keys you plan to use in `.env.local`. You only need a key for the providers you actually select — the app tells you which one is missing if you pick a provider you haven't configured.

```bash
npm run dev
```

Open http://localhost:3000.

## Environment variables

All four are server-side only. **Never** rename these with a `NEXT_PUBLIC_` prefix — that would ship your keys to the browser.

| Variable | Provider |
|---|---|
| `ZAI_API_KEY` | Z.ai |
| `DEEPSEEK_API_KEY` | DeepSeek |
| `META_API_KEY` | Meta |
| `MOONSHOT_API_KEY` | Moonshot |

Optional overrides, if a provider's API root differs from the default in `lib/models.ts`: `ZAI_BASE_URL`, `DEEPSEEK_BASE_URL`, `META_BASE_URL`, `MOONSHOT_BASE_URL`.

### Check the endpoints before your first run

Every provider is wired as an OpenAI-compatible `POST {baseUrl}/chat/completions` with `stream: true` and a `reasoning_effort` field. The base URLs and model IDs in `lib/models.ts` are my best guess at each provider's current API — confirm them against the provider's own docs. If one differs, you have three escape hatches, in increasing order of effort:

1. Set that provider's `*_BASE_URL` env var.
2. Edit the `baseUrl` / `path` / model `id` in `lib/models.ts`.
3. Give the provider its own `buildBody` and/or `extractDelta` in the same object — the request body and the stream parsing are both overridable per provider.

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, **Add New → Project**, import the repo. Framework preset auto-detects as Next.js; leave the build settings alone.
3. Before deploying, go to **Settings → Environment Variables** and add the four keys above for the Production, Preview, and Development environments.
4. Deploy.

If you add or change a key later, redeploy — Vercel bakes env vars in at build time for server routes.

Note `maxDuration = 60` in `app/api/generate/route.ts`. Vercel's Hobby plan caps serverless functions at 60s; lower it if you're on a plan with a tighter limit, or raise it on Pro.

## How it's put together

```
app/
  api/generate/route.ts   SSE endpoint — the only place API keys are touched
  layout.tsx  page.tsx  globals.css
lib/
  models.ts               provider + model catalogue (config array)
  templates.ts            template catalogue (config array)
  prompts.ts              both mode system prompts
  callModel.ts            server-only; normalizes all providers
  history.ts  types.ts
components/
  Forge.tsx               page state, controls, stream reader
  OutputPanel.tsx  HistorySidebar.tsx  ui.tsx
```

The browser posts to `/api/generate` and reads an SSE stream back. It never sees a key and never talks to a provider directly.

### Adding a provider

Append one object to `PROVIDERS` in `lib/models.ts`:

```ts
{
  id: "acme",
  label: "Acme",
  envVar: "ACME_API_KEY",
  baseUrlEnvVar: "ACME_BASE_URL",
  baseUrl: "https://api.acme.ai/v1",
  path: "/chat/completions",
  models: [
    { id: "acme-1", label: "Acme 1", efforts: ["low", "high"], defaultEffort: "high" },
  ],
}
```

The dropdowns, validation, and route handler all read from that array. Add the matching key to `.env.example` and your deployment.

### Adding a template

Append one object to `TEMPLATES` in `lib/templates.ts`. `guidance` is appended to whichever mode prompt is active, so write it as instructions to the model about the target output shape.

### Editing the mode prompts

Both live in `lib/prompts.ts` as `OPTIMIZER_SYSTEM` and `POLISHER_SYSTEM`. Nothing else in the app hardcodes prompt text.

## Notes

- History keeps the last 20 runs in localStorage under `prompt-forge:history:v1`. Clicking an entry restores the input, the output, and the settings that produced it.
- Provider errors are surfaced verbatim rather than replaced with a generic message — including a missing API key, an unsupported effort level, or a 429.
- ⌘/Ctrl + Enter runs from the textarea.
