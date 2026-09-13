import "server-only";

import { defaultBody, getModel, getProvider, type ProviderConfig } from "./models";

/**
 * Server-only. Never import this from a client component — it reads API keys
 * from process.env.
 */

export interface CallModelArgs {
  provider: string;
  model: string;
  effort: string;
  system: string;
  user: string;
  signal?: AbortSignal;
}

/** Error carrying a message we're willing to show the user verbatim. */
export class ProviderError extends Error {
  status: number;
  provider: string;

  constructor(message: string, status: number, provider: string) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.provider = provider;
  }
}

function resolveBaseUrl(provider: ProviderConfig): string {
  const override = process.env[provider.baseUrlEnvVar];
  const base = override && override.trim() ? override.trim() : provider.baseUrl;
  return base.replace(/\/+$/, "");
}

/** Pull a human-readable message out of whatever error shape came back. */
function readErrorMessage(raw: string, status: number, providerLabel: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return `${providerLabel} returned ${status} with an empty body.`;

  try {
    const parsed = JSON.parse(trimmed);
    const candidate =
      parsed?.error?.message ??
      parsed?.error?.metadata?.raw ??
      parsed?.error ??
      parsed?.message ??
      parsed?.detail ??
      parsed?.msg;

    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (candidate && typeof candidate === "object") return JSON.stringify(candidate);
  } catch {
    // Not JSON — fall through and use the raw text.
  }

  return trimmed.slice(0, 600);
}

function defaultExtractDelta(chunk: any): string {
  const choice = chunk?.choices?.[0];
  if (!choice) return "";
  // Normal streaming delta, plus a couple of shapes providers use for
  // non-streaming or final chunks.
  return choice.delta?.content ?? choice.message?.content ?? choice.text ?? "";
}

/**
 * Validates the request, calls the provider, and yields text deltas as they
 * arrive. Throws ProviderError with a message safe to show the user.
 */
export async function* callModel(args: CallModelArgs): AsyncGenerator<string> {
  const provider = getProvider(args.provider);
  if (!provider) {
    throw new ProviderError(`Unknown provider "${args.provider}".`, 400, args.provider);
  }

  const model = getModel(provider.id, args.model);
  if (!model) {
    throw new ProviderError(
      `${provider.label} has no model "${args.model}".`,
      400,
      provider.label
    );
  }

  if (!model.efforts.includes(args.effort)) {
    throw new ProviderError(
      `${model.label} doesn't support "${args.effort}" reasoning effort. Supported: ${model.efforts.join(", ")}.`,
      400,
      provider.label
    );
  }

  const apiKey = process.env[provider.envVar];
  if (!apiKey) {
    throw new ProviderError(
      `${provider.envVar} isn't set. Add it to .env.local (or your Vercel project settings) and restart.`,
      401,
      provider.label
    );
  }

  const base = { model: model.id, effort: args.effort, system: args.system, user: args.user };
  const body = provider.buildBody
    ? provider.buildBody(base, defaultBody(base))
    : defaultBody(base);

  const url = `${resolveBaseUrl(provider)}${provider.path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
      signal: args.signal,
    });
  } catch (err: any) {
    if (err?.name === "AbortError") return;
    throw new ProviderError(
      `Couldn't reach ${provider.label} at ${url}: ${err?.message ?? "network error"}`,
      502,
      provider.label
    );
  }

  if (!res.ok || !res.body) {
    const raw = res.body ? await res.text() : "";
    throw new ProviderError(
      readErrorMessage(raw, res.status, provider.label),
      res.status,
      provider.label
    );
  }

  const extract = provider.extractDelta ?? defaultExtractDelta;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line.
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";

      for (const event of events) {
        for (const line of event.split(/\r?\n/)) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;

          let parsed: any;
          try {
            parsed = JSON.parse(payload);
          } catch {
            continue;
          }

          // Some providers stream errors mid-response instead of failing the
          // request outright.
          if (parsed?.error) {
            const message =
              typeof parsed.error === "string"
                ? parsed.error
                : parsed.error.message ?? JSON.stringify(parsed.error);
            throw new ProviderError(message, 502, provider.label);
          }

          const text = extract(parsed);
          if (text) yield text;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
