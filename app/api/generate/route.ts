import { NextRequest } from "next/server";

import { ProviderError, callModel } from "@/lib/callModel";
import { buildSystemPrompt, type Mode } from "@/lib/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface GenerateBody {
  input?: unknown;
  mode?: unknown;
  template?: unknown;
  provider?: unknown;
  model?: unknown;
  effort?: unknown;
}

const MAX_INPUT_CHARS = 30_000;

function sse(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: NextRequest) {
  let body: GenerateBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ message: "Request body isn't valid JSON." }, { status: 400 });
  }

  const input = typeof body.input === "string" ? body.input.trim() : "";
  const mode = body.mode === "polisher" ? "polisher" : "optimizer";
  const template = typeof body.template === "string" ? body.template : "general";
  const provider = typeof body.provider === "string" ? body.provider : "";
  const model = typeof body.model === "string" ? body.model : "";
  const effort = typeof body.effort === "string" ? body.effort : "";

  if (!input) {
    return Response.json({ message: "Write something to work on first." }, { status: 400 });
  }
  if (input.length > MAX_INPUT_CHARS) {
    return Response.json(
      {
        message: `That's ${input.length.toLocaleString()} characters. Trim it to ${MAX_INPUT_CHARS.toLocaleString()} or fewer.`,
      },
      { status: 413 }
    );
  }

  const system = buildSystemPrompt(mode as Mode, template);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sse(event)));
      };

      try {
        for await (const delta of callModel({
          provider,
          model,
          effort,
          system,
          user: input,
          signal: req.signal,
        })) {
          send({ type: "delta", text: delta });
        }
        send({ type: "done" });
      } catch (err: any) {
        if (err?.name === "AbortError") {
          // Client navigated away or hit stop. Nothing to report.
        } else if (err instanceof ProviderError) {
          send({ type: "error", message: err.message, provider: err.provider, status: err.status });
        } else {
          send({
            type: "error",
            message: err?.message ? String(err.message) : "The request failed before any output arrived.",
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
