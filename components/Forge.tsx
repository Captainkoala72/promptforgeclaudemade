"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  PROVIDERS,
  getModel,
  getProvider,
} from "@/lib/models";
import { DEFAULT_TEMPLATE, TEMPLATES, getTemplate } from "@/lib/templates";
import { clearHistory, loadHistory, newId, saveHistory } from "@/lib/history";
import type { Mode, Run, StreamEvent } from "@/lib/types";

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

export default function Forge() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("optimizer");
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE);
  const [providerId, setProviderId] = useState<string>(DEFAULT_PROVIDER);
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL);
  const [effort, setEffort] = useState<string>(DEFAULT_EFFORT);

  const [output, setOutput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<{ message: string; provider?: string } | null>(null);

  const [history, setHistory] = useState<Run[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const controlsRef = useRef<HTMLDivElement>(null);

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
        templateId,
        provider: providerId,
        model: modelId,
        effort,
        input: text,
        output: collected,
      });
    }
  }, [input, streaming, mode, templateId, providerId, modelId, effort, commitRun]);

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
    setMode(run.mode);
    setTemplateId(run.templateId);
    if (getProvider(run.provider)) {
      setProviderId(run.provider);
      if (getModel(run.provider, run.model)) setModelId(run.model);
    }
    setEffort(run.effort);
    setError(null);
    setActiveRunId(run.id);
    setSidebarOpen(false);
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
    <div className="flex min-h-screen">
      <HistorySidebar
        runs={history}
        activeId={activeRunId}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelect={restore}
        onClear={handleClearHistory}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-ink-600 bg-ink-900/90 px-4 py-3 backdrop-blur">
          {!sidebarOpen ? (
            <Button
              variant="ghost"
              onClick={() => setSidebarOpen(true)}
              className="px-2 py-1.5"
              aria-label="Open history"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                <path
                  d="M2 4h12M2 8h12M2 12h8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </Button>
          ) : null}

          <div className="min-w-0">
            <h1 className="font-mono text-[15px] font-semibold tracking-tight text-haze-100">
              prompt<span className="text-beam">.</span>forge
            </h1>
          </div>

          {provider ? (
            <p className="ml-auto hidden truncate text-xs text-haze-500 sm:block">
              {provider.label} · {model?.label} · {effort}
            </p>
          ) : null}
        </header>

        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-6 lg:p-6">
          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="input" className="sr-only">
                Your prompt or idea
              </label>
              <textarea
                id="input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={9}
                spellCheck
                placeholder={
                  mode === "optimizer"
                    ? "a prompt that turns meeting notes into a follow-up email"
                    : "Paste the prompt you want cleaned up…"
                }
                className="w-full resize-y rounded-xl border border-ink-600 bg-ink-800 p-4 font-mono text-[13px] leading-[1.7] text-haze-100 placeholder:text-haze-500 transition-colors hover:border-ink-500 focus:border-beam focus:outline-none"
              />
              <div className="mt-1.5 flex items-center justify-between text-xs text-haze-500">
                <span className="tabular-nums">{input.length.toLocaleString()} chars</span>
                <span className="hidden sm:inline">⌘/Ctrl + Enter to run</span>
              </div>
            </div>

            {/* Mode */}
            <div>
              <div
                role="radiogroup"
                aria-label="Mode"
                className="grid grid-cols-2 gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1"
              >
                {MODES.map((m) => {
                  const selected = m.id === mode;
                  return (
                    <button
                      key={m.id}
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setMode(m.id)}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        selected
                          ? m.id === "optimizer"
                            ? "bg-beam text-ink-900"
                            : "bg-ember text-ink-900"
                          : "text-haze-300 hover:bg-ink-700"
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-haze-500">{activeMode.blurb}</p>
            </div>

            <div ref={controlsRef} className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field
                  label="Template"
                  htmlFor="template"
                  hint={template?.description}
                >
                  <Select
                    id="template"
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                  >
                    {TEMPLATES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field label="Provider" htmlFor="provider">
                <Select
                  id="provider"
                  value={providerId}
                  onChange={(e) => handleProviderChange(e.target.value)}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Model" htmlFor="model">
                <Select
                  id="model"
                  value={modelId}
                  onChange={(e) => handleModelChange(e.target.value)}
                >
                  {provider?.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="sm:col-span-2">
                <Field
                  label="Reasoning effort"
                  htmlFor="effort"
                  hint={`${model?.label ?? "This model"} supports: ${efforts.join(", ")}`}
                >
                  <Select id="effort" value={effort} onChange={(e) => setEffort(e.target.value)}>
                    {efforts.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={() => void generate()}
                disabled={streaming || !input.trim()}
                className="flex-1 py-3 text-[15px]"
              >
                {streaming ? "Running…" : mode === "optimizer" ? "Build prompt" : "Polish prompt"}
              </Button>
              {streaming ? (
                <Button onClick={stop} className="py-3">
                  Stop
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col lg:sticky lg:top-[4.25rem]">
            <OutputPanel
              output={output}
              streaming={streaming}
              error={error}
              mode={mode}
              onRerun={handleRerun}
              canRerun={!streaming && input.trim().length > 0}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
