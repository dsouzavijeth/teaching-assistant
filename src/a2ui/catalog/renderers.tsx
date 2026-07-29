"use client";

import { clsx } from "clsx";
import type { ReactNode } from "react";
import type { RendererProps } from "@copilotkit/a2ui-renderer";

/* The runtime walks `{path}` bindings against the data model before
 * handing props to renderers, so every prop value below is post-resolution. */

const GAP = {
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-10",
};
const JUSTIFY = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  spaceBetween: "justify-between",
};
const ALIGN = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
};

const Stack = ({
  props,
  children,
}: RendererProps<{
  children: string[];
  gap?: keyof typeof GAP;
  align?: keyof typeof ALIGN;
}>) => (
  <div
    className={clsx(
      "flex flex-col",
      GAP[props.gap ?? "md"],
      props.align && ALIGN[props.align],
    )}
  >
    {Array.isArray(props.children)
      ? props.children.map((id) => <Slot key={id} render={children(id)} />)
      : null}
  </div>
);

const Row = ({
  props,
  children,
}: RendererProps<{
  children: string[];
  gap?: keyof typeof GAP;
  justify?: keyof typeof JUSTIFY;
  align?: keyof typeof ALIGN;
}>) => (
  <div
    className={clsx(
      "flex flex-wrap",
      GAP[props.gap ?? "sm"],
      props.justify && JUSTIFY[props.justify],
      ALIGN[props.align ?? "center"],
    )}
  >
    {Array.isArray(props.children)
      ? props.children.map((id) => <Slot key={id} render={children(id)} />)
      : null}
  </div>
);

const Grid = ({
  props,
  children,
}: RendererProps<{
  children: string[];
  columns?: number;
  gap?: keyof typeof GAP;
}>) => {
  const cols = props.columns ?? 2;
  const colMap: Record<number, string> = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-2 lg:grid-cols-4",
    5: "grid-cols-2 lg:grid-cols-5",
    6: "grid-cols-2 lg:grid-cols-6",
  };
  return (
    <div className={clsx("grid", colMap[cols], GAP[props.gap ?? "md"])}>
      {Array.isArray(props.children)
        ? props.children.map((id) => <Slot key={id} render={children(id)} />)
        : null}
    </div>
  );
};

const Card = ({
  props,
  children,
}: RendererProps<{
  child: string;
  tone?: "default" | "lilac" | "mint" | "warning";
}>) => {
  const tones: Record<string, string> = {
    default: "bg-[var(--surface)] border-[var(--line)]",
    lilac:
      "bg-[color-mix(in_oklab,var(--lilac)_8%,white)] border-[var(--lilac)]",
    mint: "bg-[color-mix(in_oklab,var(--mint)_10%,white)] border-[color-mix(in_oklab,var(--mint)_60%,white)]",
    warning:
      "bg-[color-mix(in_oklab,var(--orange)_8%,white)] border-[color-mix(in_oklab,var(--orange)_50%,white)]",
  };
  return (
    <div
      className={clsx(
        "rounded-[var(--radius)] border p-5",
        tones[props.tone ?? "default"],
      )}
    >
      {children(props.child)}
    </div>
  );
};

const Divider = () => <hr className="border-0 border-t border-[var(--line)]" />;

const Heading = ({
  props,
}: RendererProps<{ text: string; level?: "1" | "2" | "3" }>) => {
  const level = props.level ?? "2";
  const Tag = level === "1" ? "h1" : level === "3" ? "h3" : "h2";
  const sizes = {
    "1": "text-[30px] font-semibold tracking-tight leading-[1.1]",
    "2": "text-[20px] font-semibold tracking-tight leading-[1.2]",
    "3": "text-[15px] font-semibold leading-tight",
  } as const;
  return (
    <Tag className={clsx(sizes[level], "text-[var(--ink)]")}>{props.text}</Tag>
  );
};

const Text = ({
  props,
}: RendererProps<{
  text: string;
  tone?: "default" | "muted";
  size?: "sm" | "md" | "lg";
  weight?: "regular" | "medium" | "semibold";
}>) => (
  <p
    className={clsx(
      props.size === "sm"
        ? "text-[13px]"
        : props.size === "lg"
          ? "text-[16px]"
          : "text-[14px]",
      props.tone === "muted" ? "text-[var(--ink)]" : "text-[var(--ink-2)]",
      props.weight === "medium"
        ? "font-medium"
        : props.weight === "semibold"
          ? "font-semibold"
          : "font-normal",
      "leading-relaxed",
    )}
  >
    {props.text}
  </p>
);

const Overline = ({ props }: RendererProps<{ text: string }>) => (
  <span className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink)] font-medium">
    {props.text}
  </span>
);

const Badge = ({
  props,
}: RendererProps<{
  label: string;
  tone?: "neutral" | "positive" | "warning" | "danger" | "info";
}>) => {
  const tones = {
    neutral:
      "bg-[var(--surface-soft)] text-[var(--ink-2)] border-[var(--line)]",
    info: "bg-[color-mix(in_oklab,var(--lilac)_18%,white)] text-[#2e2c75] border-[color-mix(in_oklab,var(--lilac)_60%,white)]",
    positive:
      "bg-[color-mix(in_oklab,var(--mint)_18%,white)] text-[#0a5d44] border-[color-mix(in_oklab,var(--mint)_70%,white)]",
    warning:
      "bg-[color-mix(in_oklab,var(--orange)_18%,white)] text-[#7a3f0f] border-[color-mix(in_oklab,var(--orange)_60%,white)]",
    danger:
      "bg-[color-mix(in_oklab,var(--red)_12%,white)] text-[#7a1b22] border-[color-mix(in_oklab,var(--red)_55%,white)]",
  } as const;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] mono uppercase tracking-wider font-medium",
        tones[props.tone ?? "neutral"],
      )}
    >
      {props.label}
    </span>
  );
};

const Callout = ({
  props,
}: RendererProps<{
  body: string;
  title?: string;
  tone?: "info" | "positive" | "warning" | "neutral";
}>) => {
  const tone = props.tone ?? "info";
  const accents: Record<
    typeof tone,
    { bar: string; bg: string; chip: string }
  > = {
    info: {
      bar: "bg-[var(--lilac)]",
      bg: "bg-[color-mix(in_oklab,var(--lilac)_7%,var(--surface))]",
      chip: "text-[#2e2c75]",
    },
    positive: {
      bar: "bg-[var(--mint)]",
      bg: "bg-[color-mix(in_oklab,var(--mint)_8%,var(--surface))]",
      chip: "text-[#0a5d44]",
    },
    warning: {
      bar: "bg-[var(--orange)]",
      bg: "bg-[color-mix(in_oklab,var(--orange)_8%,var(--surface))]",
      chip: "text-[#7a3f0f]",
    },
    neutral: {
      bar: "bg-[var(--ink-2)]",
      bg: "bg-[var(--surface-soft)]",
      chip: "text-[var(--ink)]",
    },
  };
  const a = accents[tone];
  return (
    <div
      className={clsx(
        "relative rounded-[var(--radius)] border border-[var(--line)] pl-4 pr-5 py-4 flex flex-col gap-1.5 overflow-hidden",
        a.bg,
      )}
    >
      <span
        aria-hidden
        className={clsx("absolute left-0 top-0 bottom-0 w-1", a.bar)}
      />
      {props.title && (
        <span
          className={clsx(
            "mono text-[10.5px] uppercase tracking-[0.14em] font-medium",
            a.chip,
          )}
        >
          {props.title}
        </span>
      )}
      <span className="text-[13.5px] leading-relaxed text-[var(--ink-2)]">
        {props.body}
      </span>
    </div>
  );
};

const BulletList = ({
  props,
}: RendererProps<{
  items: string[];
  ordered?: boolean;
}>) => {
  const items = Array.isArray(props.items) ? props.items : [];
  if (!items.length) return null;
  const Tag = props.ordered ? "ol" : "ul";
  return (
    <Tag className="flex flex-col gap-2 text-[14px] text-[var(--ink-2)] leading-relaxed list-none pl-0 m-0">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2.5">
          {props.ordered ? (
            <span
              aria-hidden
              className="mono tabular-nums text-[12px] text-[var(--ink)] font-medium leading-relaxed min-w-[1.25rem] flex-none"
            >
              {i + 1}.
            </span>
          ) : (
            <span
              aria-hidden
              className="mt-2 w-1.5 h-1.5 rounded-full bg-[var(--lilac)] flex-none"
            />
          )}
          <span className="flex-1 min-w-0">{it}</span>
        </li>
      ))}
    </Tag>
  );
};

const Button = ({
  props,
  dispatch,
}: RendererProps<{
  label: string;
  variant?: "primary" | "secondary" | "ghost";
  action: { event: { name: string; context?: Record<string, unknown> } };
}>) => {
  const variants = {
    primary: "bg-[var(--ink)] text-white hover:bg-[#1d1d23]",
    secondary:
      "border border-[var(--line)] text-[var(--ink)] hover:bg-[var(--surface-soft)]",
    ghost: "text-[var(--ink)] hover:text-[var(--ink)]",
  };
  return (
    <button
      type="button"
      onClick={() =>
        dispatch?.({ ...props.action, sourceComponentId: undefined } as never)
      }
      className={clsx(
        "inline-flex items-center gap-2 px-4 py-2 rounded-[10px] mono text-[12.5px] font-medium transition",
        variants[props.variant ?? "secondary"],
      )}
    >
      {props.label}
    </button>
  );
};

const Steps = ({
  props,
}: RendererProps<{ steps: { title: string; detail?: string }[] }>) => {
  const steps = Array.isArray(props.steps) ? props.steps : [];
  if (!steps.length) return null;
  return (
    <ol className="flex flex-col list-none pl-0 m-0">
      {steps.map((s, i) => (
        <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
          {i < steps.length - 1 && (
            <span
              aria-hidden
              className="absolute left-[15px] top-8 bottom-0 w-px bg-[var(--line)]"
            />
          )}
          <span className="relative z-10 flex-none w-8 h-8 rounded-full bg-[var(--lilac)] text-[var(--ink)] mono text-[13px] font-semibold flex items-center justify-center">
            {i + 1}
          </span>
          <div className="flex flex-col gap-0.5 pt-1 min-w-0">
            <span className="text-[14px] font-semibold text-[var(--ink)]">
              {s.title}
            </span>
            {s.detail && (
              <span className="text-[13px] text-[var(--ink-2)] leading-relaxed">
                {s.detail}
              </span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
};

const Timeline = ({
  props,
}: RendererProps<{
  events: { when: string; title: string; detail?: string }[];
}>) => {
  const events = Array.isArray(props.events) ? props.events : [];
  if (!events.length) return null;
  return (
    <ol className="flex flex-col list-none pl-0 m-0">
      {events.map((e, i) => (
        <li key={i} className="relative flex gap-3.5 pb-4 last:pb-0">
          {i < events.length - 1 && (
            <span
              aria-hidden
              className="absolute left-[5px] top-4 bottom-0 w-px bg-[var(--line)]"
            />
          )}
          <span
            aria-hidden
            className="relative z-10 mt-1.5 flex-none w-2.5 h-2.5 rounded-full bg-[var(--lilac)] ring-4 ring-[var(--lilac-soft)]"
          />
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink)]/60">
              {e.when}
            </span>
            <span className="text-[14px] font-semibold text-[var(--ink)]">
              {e.title}
            </span>
            {e.detail && (
              <span className="text-[13px] text-[var(--ink-2)] leading-relaxed">
                {e.detail}
              </span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
};

const DataTable = ({
  props,
}: RendererProps<{
  columns: { key: string; label: string; align?: "left" | "right" }[];
  rows: Record<string, string | number>[];
}>) => {
  const columns = Array.isArray(props.columns) ? props.columns : [];
  const rows = Array.isArray(props.rows) ? props.rows : [];
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--line)]">
      <table className="w-full text-[13.5px] border-collapse">
        <thead className="bg-[var(--surface-soft)]">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={clsx(
                  "px-3 py-2.5 font-medium mono uppercase tracking-[0.08em] text-[10.5px] text-[var(--ink)] border-b border-[var(--line)]",
                  c.align === "right" ? "text-right" : "text-left",
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-[var(--line-2)] last:border-b-0"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={clsx(
                    "px-3 py-2.5 text-[var(--ink-2)] align-top",
                    c.align === "right"
                      ? "text-right tabular-nums mono text-[13px]"
                      : "text-left",
                  )}
                >
                  {row[c.key] == null ? "" : String(row[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const StatGrid = ({
  props,
}: RendererProps<{
  stats: { value: string; label: string; caption?: string }[];
  columns?: number;
}>) => {
  const stats = Array.isArray(props.stats) ? props.stats : [];
  if (!stats.length) return null;
  const cols = props.columns ?? (stats.length >= 4 ? 4 : stats.length === 3 ? 3 : 2);
  const colMap: Record<number, string> = {
    2: "grid-cols-2",
    3: "grid-cols-2 sm:grid-cols-3",
    4: "grid-cols-2 sm:grid-cols-4",
  };
  return (
    <div className={clsx("grid gap-3", colMap[cols] ?? "grid-cols-2")}>
      {stats.map((s, i) => (
        <div
          key={i}
          className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-4 flex flex-col gap-1"
        >
          <span className="text-[24px] font-semibold tracking-tight text-[var(--ink)] tabular-nums leading-none">
            {s.value}
          </span>
          <span className="mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--ink)]/60">
            {s.label}
          </span>
          {s.caption && (
            <span className="text-[12px] text-[var(--ink-2)] leading-snug mt-0.5">
              {s.caption}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

const ImageView = ({
  props,
}: RendererProps<{ src: string; alt?: string; caption?: string }>) => {
  if (!props.src) return null;
  return (
    <figure className="m-0 flex flex-col items-center gap-2">
      {/* Plain <img>: the src is an external Wikipedia URL, not a bundled asset,
          so next/image's loader/domains config doesn't apply. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={props.src}
        alt={props.alt ?? props.caption ?? ""}
        loading="lazy"
        // Inline maxHeight beats the global `.a2ui-surface img` rule.
        style={{ maxHeight: 300 }}
        className="w-auto max-w-full object-contain rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-soft)]"
      />
      {props.caption && (
        <figcaption className="text-[12px] text-center text-[var(--ink)]/60 leading-snug">
          {props.caption}
        </figcaption>
      )}
    </figure>
  );
};

function Slot({ render }: { render: ReactNode }) {
  return <>{render}</>;
}

export const renderers = {
  Stack,
  Row,
  Grid,
  Card,
  Divider,
  Heading,
  Text,
  Overline,
  Badge,
  Callout,
  BulletList,
  Button,
  Steps,
  Timeline,
  DataTable,
  StatGrid,
  Image: ImageView,
};
