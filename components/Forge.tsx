"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

import {
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  PROVIDERS,
  getModel,
  getProvider,
} from "@/lib/models";
import { DEFAULT_TEMPLATE, TEMPLATES, getTemplate } from "@/lib/templates";
import { DEFAULT_OPTIMIZER_STYLE } from "@/lib/optimizerStyle";
import { clearHistory, loadHistory, newId, saveHistory } from "@/lib/history";
import type { Mode, OptimizerStyle, Run, StreamEvent } from "@/lib/types";

import HistorySidebar from "./HistorySidebar";
import OutputPanel from "./OutputPanel";
import { Button, Field, Select } from "./ui";

const MODES: { id: Mode; label: string; blurb: string }[] = [
  {
    id: "optimizer",
    label: "Optimizer",
    blurb: "Rebuilds a rough idea into a full engineered prompt.",
  },
  {
    id: "polisher",
    label: "Polisher",
    blurb: "Cleans up a prompt you wrote, without changing what it asks for.",
  },
];

const OPTIMIZER_STYLES: { id: OptimizerStyle; label: string; description: string }[] = [
  {
    id: "full-agent",
    label: "Full Agent",
    description: "A detailed prompt with role, constraints, output format, and edge cases.",
  },
  {
    id: "humanized",
    label: "Humanized",
    description: "The same depth in natural language that is easier to read and edit.",
  },
];

export default function Forge() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("optimizer");
  const [optimizerStyle, setOptimizerStyle] = useState<OptimizerStyle>(DEFAULT_OPTIMIZER_STYLE);
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE);
  const [providerId, setProviderId] = useState<string>(DEFAULT_PROVIDER);
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL);
  const [effort, setEffort] = useState<string>(DEFAULT_EFFORT);

  const [output, setOutput] = useState("");
  const [resultMode, setResultMode] = useState<Mode>("optimizer");
  const [resultStyle, setResultStyle] = useState<OptimizerStyle>(DEFAULT_OPTIMIZER_STYLE);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<{ message: string; provider?: string } | null>(null);

  const [history, setHistory] = useState<Run[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const historyButtonRef = useRef<HTMLButtonElement>(null);

  const provider = getProvider(providerId);
  const model = getModel(providerId, modelId);
  const template = getTemplate(templateId);
  const efforts = useMemo(() => model?.efforts ?? [], [model]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  /** Model changed → snap effort to something this model actually supports. */
  useEffect(() => {
    if (!model) return;
    if (!model.efforts.includes(effort)) setEffort(model.defaultEffort);
  }, [model, effort]);

  function handleProviderChange(nextProviderId: string) {
    const next = getProvider(nextProviderId);
    if (!next) return;
    const nextModel = next.models[0];
    setProviderId(next.id);
    setModelId(nextModel.id);
    setEffort(nextModel.defaultEffort);
  }

  function handleModelChange(nextModelId: string) {
    const next = getModel(providerId, nextModelId);
    if (!next) return;
    setModelId(next.id);
    setEffort(next.defaultEffort);
  }

  const commitRun = useCallback(
    (run: Run) => {
      setHistory((prev) => saveHistory([run, ...prev.filter((r) => r.id !== run.id)]));
      setActiveRunId(run.id);
    },
    []
  );

  const generate = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStreaming(true);
    setError(null);
    setOutput("");
    setResultMode(mode);
    setResultStyle(optimizerStyle);
    setActiveRunId(null);

    let collected = "";
    let failed = false;

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: text,
          mode,
          optimizerStyle: mode === "optimizer" ? optimizerStyle : DEFAULT_OPTIMIZER_STYLE,
          template: templateId,
          provider: providerId,
          model: modelId,
          effort,
        }),
        signal: controller.signal,
      });

      // Validation failures come back as plain JSON, not a stream.
      if (!res.ok && res.headers.get("content-type")?.includes("application/json")) {
        const body = await res.json().catch(() => ({}));
        setError({ message: body?.message ?? `Request failed with ${res.status}.` });
        return;
      }

      if (!res.body) {
        setError({ message: "The server returned no response body." });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;

          let event: StreamEvent;
          try {
            event = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }

          if (event.type === "delta") {
            collected += event.text;
            setOutput(collected);
          } else if (event.type === "error") {
            failed = true;
            setError({ message: event.message, provider: event.provider });
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        failed = true;
        setError({
          message: err?.message ? String(err.message) : "The connection dropped mid-run.",
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }

    if (!failed && collected.trim()) {
      commitRun({
        id: newId(),
        createdAt: Date.now(),
        mode,
        optimizerStyle: mode === "optimizer" ? optimizerStyle : DEFAULT_OPTIMIZER_STYLE,
        templateId,
        provider: providerId,
        model: modelId,
        effort,
        input: text,
        output: collected,
      });
    }
  }, [input, streaming, mode, optimizerStyle, templateId, providerId, modelId, effort, commitRun]);

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }

  function handleRerun() {
    // Same input, whatever provider/model/effort is currently selected.
    controlsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    void generate();
  }

  function restore(run: Run) {
    stop();
    setInput(run.input);
    setOutput(run.output);
    setResultMode(run.mode);
    setResultStyle(run.optimizerStyle);
    setMode(run.mode);
    setOptimizerStyle(run.optimizerStyle);
    setTemplateId(run.templateId);
    if (getProvider(run.provider)) {
      setProviderId(run.provider);
      if (getModel(run.provider, run.model)) setModelId(run.model);
    }
    setEffort(run.effort);
    setError(null);
    setActiveRunId(run.id);
    setSidebarOpen(false);
    historyButtonRef.current?.focus();
  }

  function handleClearHistory() {
    clearHistory();
    setHistory([]);
    setActiveRunId(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void generate();
    }
  }

  const activeMode = MODES.find((m) => m.id === mode)!;

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden">
      <HistorySidebar
        runs={history}
        activeId={activeRunId}
        open={sidebarOpen}
        onClose={() => { setSidebarOpen(false); historyButtonRef.current?.focus(); }}
        onSelect={restore}
        onClear={handleClearHistory}
      />
      <header className="sticky top-0 z-20 border-b border-ink-600 bg-ink-900/95">
        <div className="mx-auto flex h-[68px] w-full max-w-[1200px] items-center justify-between gap-5 px-5 sm:px-8">
          <a href="#top" className="flex min-w-0 items-center gap-3 rounded-md" aria-label="Prompt Forge home">
            <Image src="/forge-logo.webp" alt="" width={42} height={42} className="h-[42px] w-[42px] shrink-0 rounded-[10px]" priority unoptimized />
            <span className="whitespace-nowrap text-[17px] font-semibold tracking-tight text-haze-100">Prompt Forge</span>
          </a>
          <nav aria-label="Main navigation" className="flex items-center gap-2 sm:gap-5">
            <a href="#workbench" className="hidden rounded-md px-2 py-2 text-sm font-medium text-haze-300 transition-colors duration-200 hover:text-haze-100 sm:inline-flex">Workbench</a>
            <Button ref={historyButtonRef} variant="quiet" onClick={() => setSidebarOpen(true)} aria-haspopup="dialog" aria-expanded={sidebarOpen} aria-controls="run-history" className="gap-2">
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h9" /></svg>
              History
            </Button>
          </nav>
        </div>
      </header>
      <main id="top" className="flex-1">
        <section aria-labelledby="hero-title" className="mx-auto grid w-full max-w-[1200px] items-center gap-3 px-5 pb-8 pt-9 sm:px-8 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.82fr)] md:gap-10 md:pb-12 md:pt-11">
          <div className="max-w-[650px]">
            <p className="mb-4 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-beam">Prompt workbench</p>
            <h1 id="hero-title" className="max-w-[13ch] text-[40px] font-semibold leading-[1.04] tracking-[-0.045em] text-haze-100 sm:text-[52px] md:text-[clamp(3.5rem,5vw,4.25rem)]">Forge a <span className="text-beam">clearer</span> prompt.</h1>
            <p className="mt-5 max-w-[60ch] text-base leading-[1.65] text-haze-500 sm:text-[17px]">Turn a rough idea into a structured prompt, or polish one you already wrote. Choose a template and model, then work from the result.</p>
            <a href="#workbench" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-[11px] bg-beam px-5 py-2.5 text-sm font-semibold text-ink-900 transition-colors duration-200 hover:bg-ember">Open the workbench <span aria-hidden="true" className="ml-2">&rarr;</span></a>
          </div>
          <div className="relative mx-auto flex w-full max-w-[320px] items-center justify-center md:max-w-[360px]" aria-hidden="true">
            <div className="pointer-events-none absolute inset-[19%] rounded-full bg-glow/25 blur-[70px]" />
            <Image src="/forge-logo.webp" alt="" width={360} height={360} className="relative h-auto w-[240px] rounded-[18%] sm:w-[290px] md:w-[340px]" priority unoptimized />
          </div>
        </section>
        <section id="workbench" aria-labelledby="workbench-title" className="scroll-mt-[68px] border-t border-ink-600 bg-ink-850">
          <div className="mx-auto w-full max-w-[1200px] px-5 py-10 sm:px-8 md:py-14">
            <div className="mb-7 flex flex-wrap items-end justify-between gap-3 border-b border-ink-600 pb-6">
              <div>
                <p className="mb-2 font-mono text-xs font-medium uppercase tracking-[0.14em] text-beam">Your workspace</p>
                <h2 id="workbench-title" className="text-[30px] font-semibold leading-tight tracking-[-0.025em] text-haze-100 sm:text-[36px]">The workbench</h2>
              </div>
              <p className="max-w-[44ch] text-sm leading-relaxed text-haze-500">Build from a sketch or refine what you have.</p>
            </div>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-7">
              <div className="flex min-w-0 flex-col gap-6 rounded-2xl border border-ink-600 bg-ink-800 p-5 sm:p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-lg font-semibold text-haze-100">Your input</h3>
                  <span className="font-mono text-xs text-haze-500">01 / 02</span>
                </div>
                <div>
                  <label htmlFor="input" className="mb-2 block text-sm font-medium text-haze-100">Prompt or idea</label>
                  <textarea
                    id="input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={10}
                    spellCheck
                    placeholder={mode === "optimizer" ? "A prompt that turns meeting notes into a follow-up email..." : "Paste the prompt you want cleaned up..."}
                    className="min-h-[230px] w-full resize-y rounded-[12px] border border-ink-600 bg-ink-900 p-4 font-mono text-sm leading-[1.7] text-haze-100 placeholder:text-haze-500 transition-colors duration-200 hover:border-ink-500 focus:border-ember focus:outline-none"
                  />
                  <div className="mt-2 flex items-center justify-between text-xs text-haze-500">
                    <span className="tabular-nums">{input.length.toLocaleString()} characters</span>
                    <span className="hidden sm:inline">Cmd / Ctrl + Enter to run</span>
                  </div>
                </div>
                <div className="border-t border-ink-600 pt-6">
                  <p id="mode-label" className="mb-2 text-sm font-medium text-haze-100">How should it be shaped?</p>
                  <div role="group" aria-labelledby="mode-label" className="grid grid-cols-2 gap-2">
                    {MODES.map((m) => {
                      const selected = m.id === mode;
                      return (
                        <button key={m.id} type="button" aria-pressed={selected} onClick={() => setMode(m.id)}
                          className={"min-h-11 rounded-[11px] border px-3 py-2.5 text-sm font-medium transition-colors duration-200 " +
                            (selected ? "border-beam bg-beam text-ink-900" : "border-ink-600 bg-ink-900 text-haze-300 hover:border-ink-500 hover:text-haze-100")}>
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-haze-500">{activeMode.blurb}</p>
                </div>
                {mode === "optimizer" ? (
                  <div className="border-t border-ink-600 pt-6">
                    <p id="optimizer-style-label" className="mb-2 text-sm font-medium text-haze-100">Output style</p>
                    <div role="group" aria-labelledby="optimizer-style-label" className="grid gap-2 sm:grid-cols-2">
                      {OPTIMIZER_STYLES.map((style) => {
                        const selected = style.id === optimizerStyle;
                        return (
                          <button
                            key={style.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setOptimizerStyle(style.id)}
                            className={"min-h-[88px] rounded-[11px] border px-4 py-3 text-left transition-colors duration-200 " +
                              (selected ? "border-beam bg-ink-700" : "border-ink-600 bg-ink-900 hover:border-ink-500")}
                          >
                            <span className="block text-sm font-semibold text-haze-100">{style.label}</span>
                            <span className="mt-1 block text-xs leading-relaxed text-haze-500">{style.description}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                <div ref={controlsRef} className="grid gap-5 border-t border-ink-600 pt-6 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Field label="Template" htmlFor="template" hint={template?.description}>
                      <Select id="template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                        {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </Select>
                    </Field>
                  </div>
                  <Field label="Provider" htmlFor="provider">
                    <Select id="provider" value={providerId} onChange={(e) => handleProviderChange(e.target.value)}>
                      {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </Select>
                  </Field>
                  <Field label="Model" htmlFor="model">
                    <Select id="model" value={modelId} onChange={(e) => handleModelChange(e.target.value)}>
                      {provider?.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </Select>
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Reasoning effort" htmlFor="effort" hint={"Supported by " + (model?.label ?? "this model") + ": " + efforts.join(", ")}>
                      <Select id="effort" value={effort} onChange={(e) => setEffort(e.target.value)}>
                        {efforts.map((level) => <option key={level} value={level}>{level}</option>)}
                      </Select>
                    </Field>
                  </div>
                </div>
                <div className="flex gap-2 border-t border-ink-600 pt-6">
                  <Button variant="primary" onClick={() => void generate()} disabled={streaming || !input.trim()} className="flex-1 text-[15px]">
                    {streaming ? "Running..." : mode === "optimizer" ? "Build prompt" : "Polish prompt"}
                  </Button>
                  {streaming ? <Button onClick={stop}>Stop</Button> : null}
                </div>
              </div>
              <div className="min-w-0 lg:sticky lg:top-[92px]">
                <OutputPanel
                  output={output}
                  streaming={streaming}
                  error={error}
                  mode={output || streaming || error ? resultMode : mode}
                  optimizerStyle={output || streaming || error ? resultStyle : optimizerStyle}
                  onRerun={handleRerun}
                  canRerun={!streaming && input.trim().length > 0}
                />
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-ink-600 bg-ink-900">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-4 px-5 py-6 sm:px-8">
          <a href="#top" className="flex items-center gap-2.5 rounded-md text-sm font-medium text-haze-300 hover:text-haze-100">
            <Image src="/forge-logo.webp" alt="" width={28} height={28} className="h-7 w-7 rounded-[7px]" unoptimized />Prompt Forge
          </a>
          <div className="flex items-center gap-5 text-sm text-haze-500">
            <a href="#workbench" className="rounded-md hover:text-haze-100">Workbench</a>
            <a href="https://github.com/Captainkoala72/promptforgeclaudemade" target="_blank" rel="noreferrer" className="rounded-md hover:text-haze-100">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
