"use client";

import { useEffect, useRef, useState } from "react";

import { countWords } from "@/lib/history";
import { Button } from "./ui";

interface OutputPanelProps {
  output: string;
  streaming: boolean;
  error: { message: string; provider?: string } | null;
  mode: "optimizer" | "polisher";
  onRerun: () => void;
  canRerun: boolean;
}

export default function OutputPanel({
  output,
  streaming,
  error,
  mode,
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

  const accent = mode === "optimizer" ? "text-beam" : "text-ember";
  const hasOutput = output.length > 0;

  return (
    <section className="flex min-h-[320px] flex-col overflow-hidden rounded-xl border border-ink-600 bg-ink-800 lg:min-h-0 lg:flex-1">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ink-600 px-4 py-3">
        <h2 className="text-sm font-semibold text-haze-100">
          {mode === "optimizer" ? "Engineered prompt" : "Polished prompt"}
        </h2>

        {streaming ? (
          <span className={`flex items-center gap-1.5 text-xs ${accent}`}>
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
        <div className="border-b border-[#5c2b33] bg-[#2a1a20] px-4 py-3">
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
        className="flex-1 overflow-y-auto px-4 py-4 lg:max-h-[calc(100vh-16rem)]"
      >
        {hasOutput ? (
          <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-[1.7] text-haze-100">
            {output}
            {streaming ? (
              <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-[2px] animate-pulseDot bg-beam" />
            ) : null}
          </pre>
        ) : (
          <div className="flex h-full min-h-[200px] flex-col justify-center gap-2 text-sm text-haze-500">
            <p className="max-w-[52ch] leading-relaxed">
              {mode === "optimizer"
                ? "Describe what you want an AI to do — a sentence is enough. You'll get back a full prompt with role, constraints, output format, and edge cases filled in."
                : "Paste a prompt you've already written. You'll get the same prompt back, with the ambiguity and contradictions taken out."}
            </p>
          </div>
        )}
      </div>

      {hasOutput ? (
        <footer className="border-t border-ink-600 px-4 py-2 text-xs tabular-nums text-haze-500 sm:hidden">
          {countWords(output).toLocaleString()} words · {output.length.toLocaleString()} chars
        </footer>
      ) : null}
    </section>
  );
}
