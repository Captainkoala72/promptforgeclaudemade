/**
 * Provider + model catalogue.
 *
 * Adding a provider is a one-object change: append to PROVIDERS below.
 * Everything else (UI dropdowns, validation, the API route) reads from here.
 *
 * Each adapter declares its wire protocol. Chat Completions, Meta Responses,
 * and Anthropic Messages each have their own streaming and tool handling.
 */

import type { PromptImage } from "./images";

export type ProviderId = "zai" | "deepseek" | "meta" | "moonshot" | "anthropic";

export interface ModelRequest {
  model: string;
  effort: string;
  system: string;
  user: string;
  images: PromptImage[];
  webSearch: boolean;
}

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
  /** Path appended to baseUrl. */
  path: string;
  models: ModelConfig[];
  protocol?: "chat" | "responses" | "anthropic";
  searchNote: string;
  /**
   * Optional override for the request body. Receives the normalized args and
   * the default OpenAI-compatible body; return the body to actually send.
   */
  buildBody?: (
    args: ModelRequest,
    defaultBody: Record<string, unknown>
  ) => Record<string, unknown>;
}

/** Default OpenAI-compatible body shared by every provider. */
export function defaultBody(args: ModelRequest): Record<string, unknown> {
  const content = args.images.length
    ? [
        { type: "text", text: args.user },
        ...args.images.map((image) => ({
          type: "image_url",
          image_url: { url: image.dataUrl },
        })),
      ]
    : args.user;
  return {
    model: args.model,
    stream: true,
    reasoning_effort: args.effort,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content },
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
    searchNote: "Searches the web through Z.ai when useful.",
    buildBody: (_args, body) => ({ ...body, thinking: { type: "enabled", clear_thinking: false }, tool_stream: true, max_tokens: 32768 }),
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
    searchNote: "Uses Z.ai search with DeepSeek. Requires ZAI_API_KEY as well as DEEPSEEK_API_KEY.",
    buildBody: (_args, body) => ({ ...body, thinking: { type: "enabled" }, max_tokens: 32768 }),
    models: [
      {
        id: "deepseek-flash",
        label: "DeepSeek Flash",
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
    baseUrl: "https://api.meta.ai/v1",
    path: "/responses",
    protocol: "responses",
    searchNote: "Uses Meta's built-in web search and cited sources.",
    buildBody: (args) => ({
      model: args.model,
      stream: true,
      store: false,
      instructions: args.system,
      reasoning: { effort: args.effort },
      max_output_tokens: 32768,
      input: [{ role: "user", content: [
        { type: "input_text", text: args.user },
        ...args.images.map((image) => ({ type: "input_image", image_url: image.dataUrl })),
      ] }],
      ...(args.webSearch ? { tools: [{ type: "web_search" }], tool_choice: "auto" } : {}),
    }),
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
    searchNote: "Uses Kimi's built-in web search when useful.",
    buildBody: (_args, body) => ({ ...body, max_tokens: 32768 }),
    models: [
      {
        id: "kimi-k3",
        label: "Kimi K3",
        efforts: ["low", "high", "max"],
        defaultEffort: "high",
      },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    envVar: "ANTHROPIC_API_KEY",
    baseUrlEnvVar: "ANTHROPIC_BASE_URL",
    baseUrl: "https://api.anthropic.com/v1",
    path: "/messages",
    protocol: "anthropic",
    searchNote: "Uses Claude's built-in web search with adaptive thinking.",
    models: [{
      id: "claude-haiku-5-5",
      label: "Claude Haiku 5.5",
      efforts: ["medium", "high", "xhigh", "max"],
      defaultEffort: "medium",
      note: "Adaptive thinking is enabled at every effort level.",
    }],
    buildBody: (args) => ({
      model: args.model,
      stream: true,
      max_tokens: 32768,
      system: args.system,
      thinking: { type: "adaptive" },
      output_config: { effort: args.effort },
      messages: [{ role: "user", content: [
        { type: "text", text: args.user },
        ...args.images.map((image) => {
          const [header, data] = image.dataUrl.split(",");
          return { type: "image", source: { type: "base64", media_type: header.slice(5).split(";")[0], data } };
        }),
      ] }],
      ...(args.webSearch ? {
        tools: [{ type: "web_search_20260318", name: "web_search", max_uses: 5, allowed_callers: ["direct"] }],
        tool_choice: { type: "auto" },
      } : {}),
    }),
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
