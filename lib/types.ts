import type { Mode } from "./prompts";

export type { Mode };

/** One completed generation, as stored in localStorage. */
export interface Run {
  id: string;
  createdAt: number;
  mode: Mode;
  templateId: string;
  provider: string;
  model: string;
  effort: string;
  input: string;
  output: string;
}

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string; provider?: string; status?: number };
