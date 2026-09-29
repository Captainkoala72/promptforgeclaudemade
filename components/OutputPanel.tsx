"use client";

import { useEffect, useRef, useState } from "react";

import { countWords } from "@/lib/history";
import type { OptimizerStyle } from "@/lib/types";
import { Button } from "./ui";

interface OutputPanelProps {
  output: string;
  streaming: boolean;
  error: { message: string; provider?: string } | null;
  mode: "optimizer" | "polisher";
  optimizerStyle: OptimizerStyle;
  onRerun: () => void;
  canRerun: boolean;
}

export default function OutputPanel({
  output,
  streaming,
  error,
  mode,
  optimizerStyle,
  onRerun,
  canRerun,
}: OutputPanelProps) {
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  // Follow the stream, but stop following the moment the user scrolls up.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !streaming || !pinnedRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [output, streaming]);

  useEffect(() => {
    if (streaming) pinnedRef.current = true;
  }, [streaming]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const hasOutput = output.length > 0;

  return (
    <section aria-label="Prompt result" className="flex min-h-[360px] min-w-0 flex-col overflow-hidden rounded-2xl border border-ink-600 bg-ink-800 lg:min-h-[640px]">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-3 border-b border-ink-600 px-5 py-4 sm:px-6">
        <h3 className="text-lg font-semibold text-haze-100">
          {mode === "optimizer"
            ? optimizerStyle === "humanized" ? "Humanized prompt" : "Full Agent prompt"
            : "Polished prompt"}
        </h3>

        {streaming ? (
          <span role="status" className="flex items-center gap-1.5 text-xs text-ember">
            <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-current" />
            Writing
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {hasOutput ? (
            <span className="hidden text-xs tabular-nums text-haze-500 sm:inline">
              {countWords(output).toLocaleString()} words · {output.length.toLocaleString()} chars
            </span>
          ) : null}
          <Button onClick={copy} disabled={!hasOutput} aria-live="polite">
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button onClick={onRerun} disabled={!canRerun} title="Keeps your input, runs it again">
            Re-run
          </Button>
        </div>
      </header>

      {error ? (
        <div role="alert" className="border-b border-[#5c2b33] bg-[#2a1a20] px-4 py-3">
          <p className="text-sm font-medium text-[#ffb4bf]">
            {error.provider ? `${error.provider} rejected the request` : "The run failed"}
          </p>
          <p className="mt-1 break-words font-mono text-xs leading-relaxed text-[#e8a3ad]">
            {error.message}
          </p>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 lg:max-h-[calc(100vh-13rem)]"
      >
        {hasOutput ? (
          <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-[1.75] text-haze-100">
            {output}
            {streaming ? (
              <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-[2px] animate-pulseDot bg-beam" />
            ) : null}
          </pre>
        ) : (
          <div className="flex h-full min-h-[240px] flex-col justify-center gap-4 text-sm text-haze-500">
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-beam">
              {error ? "No result yet" : "Awaiting input"}
            </span>
            <p className="max-w-[52ch] leading-[1.7]">
              {error
                ? "Review the error above, then try again."
                : mode === "optimizer"
                ? optimizerStyle === "humanized"
                  ? "Describe what you want an AI to do. You'll get a complete prompt in natural wording that is easy to edit."
                  : "Describe what you want an AI to do - a sentence is enough. You'll get back a full prompt with role, constraints, output format, and edge cases filled in."
                : "Paste a prompt you've already written. You'll get the same prompt back, with the ambiguity and contradictions taken out."}
            </p>
          </div>
        )}
      </div>

      {hasOutput ? (
        <footer className="border-t border-ink-600 px-5 py-3 text-xs tabular-nums text-haze-500 sm:hidden">
          {countWords(output).toLocaleString()} words · {output.length.toLocaleString()} chars
        </footer>
      ) : null}
    </section>
  );
}
