"use client";

import { useEffect, useRef } from "react";

import { HISTORY_LIMIT, relativeTime } from "@/lib/history";
import { getModel } from "@/lib/models";
import { getTemplate } from "@/lib/templates";
import type { Run } from "@/lib/types";
import { Button } from "./ui";

interface HistorySidebarProps {
  runs: Run[];
  activeId: string | null;
  open: boolean;
  onClose: () => void;
  onSelect: (run: Run) => void;
  onClear: () => void;
}

export default function HistorySidebar({
  runs, activeId, open, onClose, onSelect, onClear,
}: HistorySidebarProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  if (!open) return null;

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
    if (event.key !== "Tab") return;
    const focusable = panelRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/70" onClick={onClose} aria-hidden="true" />
      <aside
        id="run-history"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Run history"
        onKeyDown={handleKeyDown}
        className="fixed inset-y-0 left-0 z-40 flex w-[20rem] max-w-[90vw] flex-col border-r border-ink-600 bg-ink-800 shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-ink-600 px-5 py-4">
          <h2 className="text-lg font-semibold text-haze-100">History</h2>
          <span className="font-mono text-xs text-haze-500">{runs.length}/{HISTORY_LIMIT}</span>
          <Button ref={closeRef} variant="ghost" onClick={onClose} className="ml-auto px-2" aria-label="Close history">
            <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 4l12 12M16 4 4 16" /></svg>
          </Button>
        </div>
        {runs.length === 0 ? (
          <p className="px-5 py-6 text-sm leading-relaxed text-haze-500">
            Your last {HISTORY_LIMIT} runs land here. They stay in this browser — nothing is uploaded.
          </p>
        ) : (
          <ul className="flex-1 overflow-y-auto p-3">
            {runs.map((run) => {
              const model = getModel(run.provider, run.model);
              const template = getTemplate(run.templateId);
              const isActive = run.id === activeId;
              return (
                <li key={run.id}>
                  <button onClick={() => onSelect(run)}
                    className={"mb-1 w-full rounded-[12px] border px-3 py-3 text-left transition-colors duration-200 " +
                      (isActive ? "border-beam bg-ink-700" : "border-transparent hover:border-ink-600 hover:bg-ink-700")}>
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-beam" aria-hidden="true" />
                      <span className="truncate text-xs font-medium text-haze-300">
                        {run.mode === "optimizer"
                          ? run.optimizerStyle === "humanized" ? "Optimizer · Humanized" : "Optimizer · Full Agent"
                          : "Polisher"}
                      </span>
                      <span className="ml-auto shrink-0 text-xs text-haze-500">{relativeTime(run.createdAt)}</span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-sm leading-snug text-haze-100">{run.input.slice(0, 160) || "Untitled run"}</p>
                    <p className="mt-1 truncate font-mono text-xs text-haze-500">
                      {model?.label ?? run.model} · {run.effort}
                      {template && template.id !== "general" ? " · " + template.label : ""}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {runs.length > 0 ? (
          <div className="border-t border-ink-600 p-4">
            <Button variant="quiet" onClick={onClear} className="w-full">Clear history</Button>
          </div>
        ) : null}
      </aside>
    </>
  );
}
