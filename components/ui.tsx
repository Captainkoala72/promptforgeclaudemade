"use client";

import { forwardRef } from "react";

interface FieldProps {
  label: string;
  hint?: string;
  htmlFor: string;
  children: React.ReactNode;
}

export function Field({ label, hint, htmlFor, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-haze-300">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs leading-relaxed text-haze-500">{hint}</p> : null}
    </div>
  );
}

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = "", children, ...props }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          {...props}
          className={`w-full appearance-none rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 pr-9 text-sm text-haze-100 transition-colors hover:border-ink-500 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        >
          {children}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-haze-500"
        >
          <path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
);

type ButtonVariant = "primary" | "quiet" | "ghost";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-beam text-ink-900 font-semibold hover:bg-[#93aeff] disabled:bg-ink-600 disabled:text-haze-500",
  quiet:
    "border border-ink-600 bg-ink-800 text-haze-100 hover:border-ink-500 hover:bg-ink-700",
  ghost: "text-haze-300 hover:text-haze-100 hover:bg-ink-700",
};

export function Button({ variant = "quiet", className = "", ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${className}`}
    />
  );
}
