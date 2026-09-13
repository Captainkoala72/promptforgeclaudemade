/**
 * Provider + model catalogue.
 *
 * Adding a provider is a one-object change: append to PROVIDERS below.
 * Everything else (UI dropdowns, validation, the API route) reads from here.
 *
 * Each provider is assumed to expose an OpenAI-compatible
 * POST {baseUrl}/chat/completions endpoint with SSE streaming. If a provider
 * differs, give it its own `buildBody` and/or `extractDelta`.
 */

export type ProviderId = "zai" | "deepseek" | "meta" | "moonshot";

export interface ModelConfig {
  /** Wire-format model id sent to the provider. */
  id: string;
  /** Human label in the UI. */
  label: string;
  /** Reasoning effort levels this specific model supports. */
  efforts: string[];
  /** Pre-selected effort for this model. */
  defaultEffort: string;
  /** One-line note shown under the model select. */
  note?: string;
}

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  /** Server-side env var holding the API key. Never NEXT_PUBLIC_*. */
  envVar: string;
  /** Env var that can override baseUrl at deploy time. */
  baseUrlEnvVar: string;
  /** Default API root, no trailing slash. */
  baseUrl: string;
  /** Path appended to baseUrl for chat completions. */
  path: string;
  models: ModelConfig[];
  /**
   * Optional override for the request body. Receives the normalized args and
   * the default OpenAI-compatible body; return the body to actually send.
   */
  buildBody?: (
    args: { model: string; effort: string; system: string; user: string },
    defaultBody: Record<string, unknown>
  ) => Record<string, unknown>;
  /** Optional override for pulling text out of a streamed SSE chunk. */
  extractDelta?: (chunk: any) => string;
}

/** Default OpenAI-compatible body shared by every provider. */
export function defaultBody(args: {
  model: string;
  effort: string;
  system: string;
  user: string;
}): Record<string, unknown> {
  return {
    model: args.model,
    stream: true,
    reasoning_effort: args.effort,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
  };
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "zai",
    label: "Z.ai",
    envVar: "ZAI_API_KEY",
    baseUrlEnvVar: "ZAI_BASE_URL",
    baseUrl: "https://api.z.ai/api/paas/v4",
    path: "/chat/completions",
    models: [
      {
        id: "glm-5.3-flash",
        label: "GLM 5.3 Flash",
        efforts: ["low", "high", "max"],
        defaultEffort: "high",
      },
    ],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    envVar: "DEEPSEEK_API_KEY",
    baseUrlEnvVar: "DEEPSEEK_BASE_URL",
    baseUrl: "https://api.deepseek.com/v1",
    path: "/chat/completions",
    models: [
      {
        id: "deepseek-4.1-flash",
        label: "DeepSeek 4.1 Flash",
        efforts: ["low", "high", "max"],
        defaultEffort: "high",
      },
    ],
  },
  {
    id: "meta",
    label: "Meta",
    envVar: "META_API_KEY",
    baseUrlEnvVar: "META_BASE_URL",
    baseUrl: "https://api.llama.com/compat/v1",
    path: "/chat/completions",
    models: [
      {
        id: "muse-spark-1.3",
        label: "Muse Spark 1.3",
        efforts: ["low", "medium", "high", "xhigh"],
        defaultEffort: "medium",
      },
    ],
  },
  {
    id: "moonshot",
    label: "Moonshot",
    envVar: "MOONSHOT_API_KEY",
    baseUrlEnvVar: "MOONSHOT_BASE_URL",
    baseUrl: "https://api.moonshot.ai/v1",
    path: "/chat/completions",
    models: [
      {
        id: "kimi-k3",
        label: "Kimi K3",
        efforts: ["low", "high", "max"],
        defaultEffort: "high",
      },
    ],
  },
];

export function getProvider(id: string): ProviderConfig | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function getModel(providerId: string, modelId: string): ModelConfig | undefined {
  return getProvider(providerId)?.models.find((m) => m.id === modelId);
}

/** Efforts for a given model, used to repopulate the effort dropdown. */
export function effortsFor(providerId: string, modelId: string): string[] {
  return getModel(providerId, modelId)?.efforts ?? [];
}

export const DEFAULT_PROVIDER = PROVIDERS[0].id;
export const DEFAULT_MODEL = PROVIDERS[0].models[0].id;
export const DEFAULT_EFFORT = PROVIDERS[0].models[0].defaultEffort;
