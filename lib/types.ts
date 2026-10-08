import type { Mode } from "./prompts";
import type { OptimizerStyle } from "./optimizerStyle";

export type { Mode, OptimizerStyle };

export interface Source {
  title: string;
  url: string;
}

/** One completed generation, as stored in localStorage. */
export interface Run {
  id: string;
  createdAt: number;
  mode: Mode;
  optimizerStyle: OptimizerStyle;
  templateId: string;
  provider: string;
  model: string;
  effort: string;
  input: string;
  instructions?: string;
  webSearch?: boolean;
  sources?: Source[];
  imageNames?: string[];
  output: string;
}

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "source"; source: Source }
  | { type: "done" }
  | { type: "error"; message: string; provider?: string; status?: number };
