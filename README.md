# Prompt Forge

A single-user prompt workbench built with Next.js, TypeScript, and Tailwind.

- **Optimizer** turns a rough idea into a complete prompt. Choose **Full Agent** for a structured specification or **Humanized** for natural wording.
- **Polisher** edits an existing prompt while preserving its intent, voice, and approximate length.
- **Instructions for the AI** is a separate, optional text field. Use it to steer the edit: "Keep my casual voice", "Don't add sections", or "Verify the referenced API". It is sent as editor guidance in each provider's system/instructions field. The original prompt stays in the user message.
- **Web search** is optional and off by default. Each model remembers its own toggle during the session. The model decides whether research is useful; turning it on makes the tool available rather than forcing every run to search.
- Attach or paste up to three PNG, JPEG, or WebP reference images (2.5 MB combined). Images are sent to the selected provider.
- Completed runs save the original prompt, editor instructions, model, effort, search setting, sources, and output in browser history. Images are stored separately in IndexedDB. Old entries restore with empty instructions and search off.

## Setup

Requires Node.js 20.9+.

~~~bash
npm ci
cp .env.example .env.local
npm run dev
~~~

Add keys only for the providers you use. All keys are server-side; never prefix them with NEXT_PUBLIC_.

| Variable | Provider |
|---|---|
| ZAI_API_KEY | Z.ai; also supplies the search service used by DeepSeek |
| DEEPSEEK_API_KEY | DeepSeek |
| META_API_KEY | Meta |
| MOONSHOT_API_KEY | Moonshot |
| ANTHROPIC_API_KEY | Anthropic |

Optional API root overrides: ZAI_BASE_URL, DEEPSEEK_BASE_URL, META_BASE_URL, MOONSHOT_BASE_URL, ANTHROPIC_BASE_URL. These are roots, without the final endpoint path. ZAI_SEARCH_BASE_URL independently overrides the Z.ai search API root (default https://api.z.ai/api/paas/v4).

## Models and web search

| Model | API and reasoning | Search integration |
|---|---|---|
| GLM 5.3 Flash | Chat Completions; thinking enabled; low/high/max | Function calling backed by Z.ai POST /web_search |
| DeepSeek Flash | Chat Completions; thinking enabled; low/high/max | Function calling backed by Z.ai POST /web_search; requires both keys |
| Muse Spark 1.3 | Meta Responses; reasoning.effort low/medium/high/xhigh | Meta's hosted web_search tool |
| Kimi K3 | Chat Completions; reasoning_effort low/high/max | Kimi's builtin_function named $web_search; returned arguments are echoed unchanged |
| Claude Haiku 5.5 | Anthropic Messages; thinking.type adaptive; output_config.effort medium/high/xhigh/max | Anthropic's hosted web_search_20260318 tool with direct calling |

Claude uses ANTHROPIC_API_KEY in the x-api-key header and the anthropic-version header. It uses Anthropic image source blocks, never OpenAI image_url blocks. Temperature and manual thinking budgets are omitted. Search tools are included only when the toggle is on. No local shell, filesystem, or arbitrary code tools are exposed.

Search loops preserve required reasoning and tool IDs. Claude pause_turn continuations replay signed thinking and encrypted search blocks. Client tool loops and server-tool continuations stop after six requests. Anthropic search is capped at five uses per request. Search failures, provider errors, output limits, empty responses, and interrupted streams surface as errors instead of successful history entries. Stop cancels the upstream request.

Research sources appear as clickable links separately from the copyable prompt. Research-enabled runs buffer the final text so tool preambles are kept out of the prompt. Provider thinking stays server-side.

Official references:
- [GLM 5.3 Flash](https://docs.z.ai/guides/vlm/glm-5.3-flash) and [Z.ai Web Search](https://docs.z.ai/api-reference/tools/web-search)
- [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/) (only function tools are supported)
- [Meta search grounding](https://dev.meta.ai/docs/search-grounding) and [Responses API](https://dev.meta.ai/docs/protocols/responses)
- [Kimi web search](https://platform.moonshot.ai/docs/guide/use-web-search)
- [Claude Haiku 5.5](https://platform.claude.com/docs/en/models/haiku-5-5/overview), [effort](https://platform.claude.com/docs/en/build-with-claude/effort), and [web search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool)

## Validation

~~~bash
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:browser
~~~

The Node suite uses mocked provider streams to test the exact request shapes, all four Claude efforts, fragmented SSE, tool continuations, citations, errors, validation, and old history. Browser tests run against a production build and verify all five model selections, separate instruction routing, per-model toggles, persisted history, mobile layout, and interrupted output. On Windows with Edge installed, set PLAYWRIGHT_CHANNEL=msedge instead of downloading Chromium.

GitHub Actions runs these checks on pushes and pull requests. Tests use dummy keys and do not call paid APIs. Live access still depends on valid provider keys, account permissions, quota, and tool availability.

## Deploy to Vercel

This repository is connected to https://promptforgeclaudemade.vercel.app. Pushing main triggers production deployment.

1. Add ANTHROPIC_API_KEY in the Vercel project's environment settings (Production and Preview as needed). Keep the other provider keys.
2. For DeepSeek web search, ensure ZAI_API_KEY is also configured. The Z.ai account must permit the standalone search service; a coding-only subscription may not cover it.
3. Anthropic web search must be permitted by your organization's Claude Console settings.
4. Use Node.js 20.9+ and enable Vercel Fluid compute. The generation route allows 300 seconds, with a 290-second application timeout and 15-second SSE keepalives. [Vercel duration limits](https://vercel.com/docs/functions/configuring-functions/duration).
5. Redeploy after changing environment variables. Secrets stay out of source control and browser bundles.

## Structure

- app/api/generate/route.ts validates input and emits normalized SSE events.
- lib/models.ts defines the model catalogue and provider-specific request bodies.
- lib/callModel.ts handles authentication, provider streams, tool calls, search, and sources.
- lib/prompts.ts builds mode instructions, template guidance, image context, and separate editor guidance.
- components/Forge.tsx manages controls, attachments, streaming, and history.
- components/OutputPanel.tsx displays the prompt and source links.
- lib/history.ts stores the last 20 completed runs in localStorage; lib/imageHistory.ts stores images in IndexedDB.

Cmd/Ctrl + Enter runs from either text field. History and image storage stay in the browser.
