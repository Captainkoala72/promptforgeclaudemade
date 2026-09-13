"use client";

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
  runs,
  activeId,
  open,
  onClose,
  onSelect,
  onClear,
}: HistorySidebarProps) {
  return (
    <>
      {/* Scrim, mobile only. */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-30 bg-black/60 transition-opacity lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        aria-label="Run history"
        className={`fixed inset-y-0 left-0 z-40 flex w-[19rem] max-w-[85vw] flex-col border-r border-ink-600 bg-ink-800 transition-transform duration-200 lg:static lg:z-auto lg:max-w-none lg:translate-x-0 lg:transition-[width] ${
          open ? "translate-x-0" : "-translate-x-full lg:w-0 lg:overflow-hidden lg:border-r-0"
        }`}
      >
        <div className="flex items-center gap-2 border-b border-ink-600 px-4 py-3">
          <h2 className="text-sm font-semibold text-haze-100">History</h2>
          <span className="text-xs text-haze-500">
            {runs.length}/{HISTORY_LIMIT}
          </span>
          <Button variant="ghost" onClick={onClose} className="ml-auto px-2 py-1" aria-label="Close history">
            <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" aria-hidden="true">
              <path
                d="M3 3l8 8M11 3l-8 8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </Button>
        </div>

        {runs.length === 0 ? (
          <p className="px-4 py-6 text-sm leading-relaxed text-haze-500">
            Your last {HISTORY_LIMIT} runs land here. They stay in this browser — nothing is uploaded.
          </p>
        ) : (
          <ul className="flex-1 overflow-y-auto p-2">
            {runs.map((run) => {
              const model = getModel(run.provider, run.model);
              const template = getTemplate(run.templateId);
              const isActive = run.id === activeId;
              return (
                <li key={run.id}>
                  <button
                    onClick={() => onSelect(run)}
                    className={`mb-1 w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      isActive
                        ? "border-ink-500 bg-ink-700"
                        : "border-transparent hover:border-ink-600 hover:bg-ink-700/60"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          run.mode === "optimizer" ? "bg-beam" : "bg-ember"
                        }`}
                      />
                      <span className="text-xs font-medium text-haze-300">
                        {run.mode === "optimizer" ? "Optimizer" : "Polisher"}
                      </span>
                      <span className="ml-auto shrink-0 text-xs text-haze-500">
                        {relativeTime(run.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-haze-100">
                      {run.input.slice(0, 160) || "Untitled run"}
                    </p>
                    <p className="mt-1 truncate text-xs text-haze-500">
                      {model?.label ?? run.model} · {run.effort}
                      {template && template.id !== "general" ? ` · ${template.label}` : ""}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {runs.length > 0 ? (
          <div className="border-t border-ink-600 px-4 py-3">
            <Button variant="ghost" onClick={onClear} className="w-full">
              Clear history
            </Button>
          </div>
        ) : null}
      </aside>
    </>
  );
}
