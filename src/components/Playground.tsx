"use client";

import { useEffect, useMemo, useState } from "react";
import { compile } from "mathjs";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { surfaceBus } from "@/a2ui/surface-bus";
import type { A2UIOp } from "@/a2ui/surface-bus";

const PLAYGROUND_SURFACE = "playground";

type PlaygroundSpec = {
  title: string;
  expression: string;
  xLabel: string;
  yLabel: string;
  min: number;
  max: number;
  step: number;
  initial: number;
};

function isPlaygroundSpec(v: unknown): v is PlaygroundSpec {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.expression === "string" &&
    typeof s.min === "number" &&
    typeof s.max === "number"
  );
}

/** Scan the raw op log for the latest updateDataModel targeting the
 * "playground" surface. Reading the surface bus directly (rather than going
 * through @copilotkit/a2ui-renderer's provider) keeps this widget fully
 * app-owned — it needs no A2UIProvider context, same as how a map or a
 * custom chart would read agent-pushed data in any A2UI app. Exported so
 * TutorWorkspace can adapt its layout to whether a playground exists yet. */
export function latestPlaygroundSpec(ops: A2UIOp[]): PlaygroundSpec | undefined {
  let found: PlaygroundSpec | undefined;
  for (const op of ops) {
    const ud = op.updateDataModel as
      | { surfaceId?: string; value?: unknown }
      | undefined;
    if (ud?.surfaceId === PLAYGROUND_SURFACE && isPlaygroundSpec(ud.value)) {
      found = ud.value;
    }
  }
  return found;
}

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  fontSize: 12,
  padding: "6px 10px",
  color: "var(--ink)",
};

const axisTick = { fontSize: 11, fill: "var(--ink)", fontWeight: 500 };

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

/**
 * The live math.js Playground. The agent hands it a single-variable
 * expression plus a slider range via update_data_model; from then on every
 * drag recomputes the curve position and the result number entirely in the
 * browser — no round-trip to the model.
 */
export function Playground({ channel }: { channel: string }) {
  const [spec, setSpec] = useState<PlaygroundSpec | undefined>(() =>
    latestPlaygroundSpec(surfaceBus.snapshot(channel).ops),
  );
  const [x, setX] = useState<number>(() => spec?.initial ?? 0);

  useEffect(() => {
    return surfaceBus.subscribe(channel, (snap) => {
      const next = latestPlaygroundSpec(snap.ops);
      if (next) {
        setSpec(next);
        setX(next.initial);
      }
    });
  }, [channel]);

  const compiled = useMemo(() => {
    if (!spec) return null;
    try {
      return compile(spec.expression);
    } catch {
      return null;
    }
  }, [spec?.expression]);

  const curve = useMemo(() => {
    if (!spec || !compiled) return [] as { x: number; y: number }[];
    const span = spec.max - spec.min;
    const stepGuess = spec.step > 0 ? spec.step : span / 50;
    const samples = Math.min(200, Math.max(2, Math.round(span / stepGuess)));
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i <= samples; i++) {
      const xv = spec.min + (span * i) / samples;
      try {
        const yv = compiled.evaluate({ x: xv });
        if (typeof yv === "number" && Number.isFinite(yv)) {
          points.push({ x: xv, y: yv });
        }
      } catch {
        // undefined at this point (e.g. div/0, log of negative) — skip it
      }
    }
    return points;
  }, [spec, compiled]);

  const currentY = useMemo(() => {
    if (!compiled) return null;
    try {
      const v = compiled.evaluate({ x });
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    } catch {
      return null;
    }
  }, [compiled, x]);

  if (!spec) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-center">
        <div>
          <p className="mono uppercase tracking-[0.14em] text-[11px] text-[var(--ink)]/60">
            playground
          </p>
          <p className="mt-2 text-[13px] text-[var(--ink)]/70 max-w-xs">
            Ask Sage for something hands-on — a live slider and chart will
            appear here.
          </p>
        </div>
      </div>
    );
  }

  const step = spec.step > 0 ? spec.step : (spec.max - spec.min) / 100;

  return (
    <div className="h-full flex flex-col gap-4 p-5 overflow-y-auto">
      <div>
        <p className="mono uppercase tracking-[0.14em] text-[11px] text-[var(--ink)]/60">
          playground
        </p>
        <h3 className="text-[16px] font-semibold tracking-tight text-[var(--ink)]">
          {spec.title}
        </h3>
      </div>

      <div className="flex-1 min-h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={curve} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
            <CartesianGrid stroke="var(--line-2)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="x"
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              tickFormatter={fmt}
              label={{
                value: spec.xLabel,
                position: "insideBottom",
                offset: -4,
                style: { fontSize: 11, fill: "var(--ink)" },
              }}
            />
            <YAxis
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={fmt}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: unknown) => fmt(Number(v))}
              labelFormatter={(v: unknown) => `${spec.xLabel}: ${fmt(Number(v))}`}
            />
            <Line
              type="monotone"
              dataKey="y"
              stroke="#3b3a8a"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
            {currentY != null && (
              <ReferenceDot
                x={x}
                y={currentY}
                r={6}
                fill="var(--lilac)"
                stroke="#3b3a8a"
                strokeWidth={2}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-4 flex items-center justify-between gap-3">
        <span className="text-[12px] text-[var(--ink)]/70">{spec.yLabel}</span>
        <span className="text-[24px] font-semibold tabular-nums text-[var(--ink)] leading-none">
          {currentY != null ? fmt(currentY) : "—"}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-[11px] mono uppercase tracking-[0.1em] text-[var(--ink)]/70">
          <span>{spec.xLabel}</span>
          <span className="tabular-nums">{fmt(x)}</span>
        </div>
        <input
          type="range"
          className="playground-slider"
          min={spec.min}
          max={spec.max}
          step={step}
          value={x}
          onChange={(e) => setX(Number(e.target.value))}
        />
      </div>
    </div>
  );
}
