"use client";

import { useEffect, useState } from "react";
import type { Verdict } from "@/lib/metrics";

export function Card({
  children,
  className = "",
  lift = false,
}: {
  children: React.ReactNode;
  className?: string;
  lift?: boolean;
}) {
  return <div className={`${lift ? "card-lift" : "card"} ${className}`}>{children}</div>;
}

export function SectionTitle({
  eyebrow,
  title,
  right,
}: {
  eyebrow?: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-3">
      <div className="min-w-0">
        {eyebrow ? <div className="eyebrow mb-1">{eyebrow}</div> : null}
        <h2 className="text-[15px] font-semibold tracking-tight truncate">{title}</h2>
      </div>
      {right ? <div className="flex items-center gap-2 shrink-0">{right}</div> : null}
    </div>
  );
}

/**
 * Status is never carried by color alone — every verdict ships an icon and a
 * word, which is also what keeps it readable in forced-colors and print.
 */
const VERDICT_META: Record<Verdict, { icon: string; label: string; color: string }> = {
  good: { icon: "▲", label: "Por encima", color: "var(--status-good)" },
  neutral: { icon: "●", label: "En media", color: "var(--text-muted)" },
  warning: { icon: "▼", label: "Por debajo", color: "var(--status-warning)" },
  serious: { icon: "▼", label: "Flojo", color: "var(--status-serious)" },
  critical: { icon: "▼", label: "Crítico", color: "var(--status-critical)" },
};

export function VerdictTag({ verdict, detail }: { verdict: Verdict; detail?: string }) {
  const m = VERDICT_META[verdict];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-medium"
      style={{ color: m.color }}
      title={detail}
    >
      <span aria-hidden>{m.icon}</span>
      <span>{detail ?? m.label}</span>
    </span>
  );
}

export function Stat({
  label,
  value,
  sub,
  hint,
  accent = false,
  footer,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  hint?: string;
  accent?: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <div className="card p-4 flex flex-col gap-1.5 min-w-0" title={hint}>
      <div className="eyebrow truncate">{label}</div>
      <div
        className="hero-figure truncate"
        style={accent ? { color: "var(--gold)" } : undefined}
      >
        {value}
      </div>
      {sub ? <div className="text-[12px] text-[var(--text-secondary)] truncate">{sub}</div> : null}
      {footer}
    </div>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <div className="text-center py-12 px-6">
      <div className="text-[13px] font-medium mb-1">{title}</div>
      {body ? <div className="text-[12px] text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">{body}</div> : null}
    </div>
  );
}

export function Skeleton({ className = "h-24" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("aurum-theme");
    if (saved === "dark" || saved === "light") setTheme(saved);
    else setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);

  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("aurum-theme", next);
  };

  return (
    <button className="btn" onClick={flip} aria-label="Cambiar tema" title="Cambiar tema">
      {theme === "dark" ? "☾" : "☀"}
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
      style={{ background: "rgba(10,9,6,0.55)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        className={`card-lift w-full ${wide ? "max-w-4xl" : "max-w-2xl"} my-4`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <h3 className="text-[14px] font-semibold">{title}</h3>
          <button className="btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="gold-rule" />
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Labeled({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <div className="eyebrow mb-1.5" title={hint}>{label}</div>
      {children}
    </label>
  );
}

export function NumberField({
  value,
  onChange,
  step = 1,
  placeholder,
}: {
  value: number | null;
  onChange: (v: number) => void;
  step?: number;
  placeholder?: string;
}) {
  return (
    <input
      className="field tnum"
      type="number"
      inputMode="decimal"
      step={step}
      min={0}
      placeholder={placeholder}
      value={value == null || Number.isNaN(value) ? "" : value}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
    />
  );
}

/**
 * Minimal markdown renderer — headings, bold, bullets, numbered lists.
 * The AI output is ours, but it is still rendered as text nodes, never as HTML.
 */
export function Markdown({ source }: { source: string }) {
  const lines = source.split("\n");
  const out: React.ReactNode[] = [];
  let list: React.ReactNode[] = [];
  let ordered = false;

  const flush = () => {
    if (!list.length) return;
    out.push(
      ordered ? (
        <ol key={`l${out.length}`} className="list-decimal pl-5 space-y-2 my-2 text-[13px] leading-relaxed">{list}</ol>
      ) : (
        <ul key={`l${out.length}`} className="list-disc pl-5 space-y-1.5 my-2 text-[13px] leading-relaxed">{list}</ul>
      ),
    );
    list = [];
  };

  const inline = (s: string): React.ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={i} className="px-1 py-0.5 rounded text-[12px]" style={{ background: "var(--surface-2)" }}>
            {part.slice(1, -1)}
          </code>
        );
      }
      return <span key={i}>{part}</span>;
    });

  const isTableRow = (s: string) => /^\s*\|.*\|\s*$/.test(s);
  const isDivider = (s: string) => /^\s*\|[\s:|-]+\|\s*$/.test(s);
  const cells = (s: string) =>
    s.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();

    // Markdown tables — the model reaches for them to compare an ad against the
    // account average, which is exactly the right form for that.
    if (isTableRow(line) && isTableRow(lines[i + 1] ?? "") && isDivider(lines[i + 1])) {
      flush();
      const head = cells(line);
      const body: string[][] = [];
      let j = i + 2;
      while (j < lines.length && isTableRow(lines[j])) { body.push(cells(lines[j])); j++; }
      i = j - 1;
      out.push(
        <div key={out.length} className="scroll-x my-3">
          <table className="w-full text-[12px] tnum">
            <thead>
              <tr className="text-left text-[var(--text-muted)]">
                {head.map((h, k) => (
                  <th key={k} className="py-1.5 pr-4 font-medium whitespace-nowrap">{inline(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, k) => (
                <tr key={k} style={{ borderTop: "1px solid var(--hairline)" }}>
                  {row.map((c, n) => (
                    <td key={n} className="py-1.5 pr-4 align-top">{inline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^#{1,6}\s/.test(line)) {
      flush();
      const level = line.match(/^#+/)![0].length;
      const text = line.replace(/^#+\s*/, "");
      out.push(
        <h4
          key={out.length}
          className={`font-semibold tracking-tight mt-5 mb-2 first:mt-0 ${level <= 2 ? "text-[14px]" : "text-[13px]"}`}
          style={level <= 2 ? { color: "var(--gold)" } : undefined}
        >
          {text}
        </h4>,
      );
    } else if (/^\s*[-*•]\s+/.test(line)) {
      if (ordered) flush();
      ordered = false;
      list.push(<li key={list.length}>{inline(line.replace(/^\s*[-*•]\s+/, ""))}</li>);
    } else if (/^\s*\d+[.)]\s+/.test(line)) {
      if (!ordered && list.length) flush();
      ordered = true;
      list.push(<li key={list.length}>{inline(line.replace(/^\s*\d+[.)]\s+/, ""))}</li>);
    } else if (!line.trim()) {
      flush();
    } else {
      flush();
      out.push(
        <p key={out.length} className="text-[13px] leading-relaxed my-2 text-[var(--text-secondary)]">
          {inline(line)}
        </p>,
      );
    }
  }
  flush();
  return <div>{out}</div>;
}
