import { NextRequest } from "next/server";

import { ProviderError, callModel } from "@/lib/callModel";
import { buildSystemPrompt, type Mode } from "@/lib/prompts";
import { MAX_IMAGE_BYTES, MAX_IMAGES, MAX_TOTAL_IMAGE_BYTES, type PromptImage } from "@/lib/images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface GenerateBody {
  input?: unknown;
  mode?: unknown;
  optimizerStyle?: unknown;
  template?: unknown;
  provider?: unknown;
  model?: unknown;
  effort?: unknown;
  images?: unknown;
}

const MAX_INPUT_CHARS = 30_000;

function parseImages(value: unknown): { images: PromptImage[]; error?: string; status?: number } {
  if (value === undefined) return { images: [] };
  if (!Array.isArray(value) || value.length > MAX_IMAGES) {
    return { images: [], error: `Attach no more than ${MAX_IMAGES} images.`, status: 400 };
  }

  const images: PromptImage[] = [];
  let totalBytes = 0;
  for (const item of value) {
    if (!item || typeof item !== "object") {
      return { images: [], error: "An image attachment is invalid.", status: 400 };
    }
    const name = typeof item.name === "string" ? item.name.trim().slice(0, 120) : "";
    const dataUrl = typeof item.dataUrl === "string" ? item.dataUrl : "";
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!name || !match) {
      return { images: [], error: "Attach a valid PNG, JPEG, or WebP image.", status: 400 };
    }
    const encoded = match[2];
    if (encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4) {
      return { images: [], error: "An image is over the 2 MB limit.", status: 413 };
    }
    const bytes = Buffer.from(encoded, "base64");
    const type = match[1];
    const validSignature =
      (type === "png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (type === "jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
      (type === "webp" && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP");
    if (!bytes.length || !validSignature || bytes.toString("base64") !== encoded) {
      return { images: [], error: `${name} is not a valid ${type.toUpperCase()} image.`, status: 400 };
    }
    if (bytes.length > MAX_IMAGE_BYTES) {
      return { images: [], error: "An image is over the 2 MB limit.", status: 413 };
    }
    totalBytes += bytes.length;
    if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
      return { images: [], error: "Images exceed the 2.5 MB combined limit.", status: 413 };
    }
    images.push({ name, dataUrl, bytes: bytes.length });
  }
  return { images };
}

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
  const optimizerStyle = body.optimizerStyle === "humanized" ? "humanized" : "full-agent";
  const template = typeof body.template === "string" ? body.template : "general";
  const provider = typeof body.provider === "string" ? body.provider : "";
  const model = typeof body.model === "string" ? body.model : "";
  const effort = typeof body.effort === "string" ? body.effort : "";
  const parsedImages = parseImages(body.images);

  if (parsedImages.error) {
    return Response.json({ message: parsedImages.error }, { status: parsedImages.status });
  }

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

  const system = buildSystemPrompt(mode as Mode, template, optimizerStyle, parsedImages.images.length > 0);
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
          images: parsedImages.images,
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
