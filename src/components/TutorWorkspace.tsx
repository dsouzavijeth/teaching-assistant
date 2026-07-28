"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  A2UIProvider,
  A2UIRenderer,
  useA2UIActions,
} from "@copilotkit/a2ui-renderer";
import { useAgent } from "@copilotkit/react-core/v2";
import { catalog } from "@/a2ui/catalog";
import { surfaceBus } from "@/a2ui/surface-bus";
import { Playground, latestPlaygroundSpec } from "./Playground";

const CHANNEL = "sage_tutor";
const LESSON_SURFACE = "lesson-card";

function prettify(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|\s)\w/g, (m) => m.toUpperCase());
}

export function TutorWorkspace() {
  const { agent } = useAgent({ agentId: CHANNEL });
  const [consumedRev, setConsumedRev] = useState<number | null>(null);
  const [hasPlayground, setHasPlayground] = useState(
    () => latestPlaygroundSpec(surfaceBus.snapshot(CHANNEL).ops) != null,
  );
  const revisionRef = useRef(0);

  // The playground pane only exists once the agent has pushed a spec —
  // until then the lesson card gets the whole workspace.
  useEffect(() => {
    return surfaceBus.subscribe(CHANNEL, (snap) => {
      if (latestPlaygroundSpec(snap.ops)) setHasPlayground(true);
    });
  }, []);

  const handleRevisionChange = useCallback((rev: number) => {
    revisionRef.current = rev;
  }, []);

  const onAction = useCallback(
    (message: unknown) => {
      const ua = (
        message as {
          userAction?: { name?: string; context?: Record<string, unknown> };
        }
      )?.userAction;
      if (!ua?.name) return;

      // Freeze the current card right away so it can't be clicked twice.
      setConsumedRev(revisionRef.current);

      let label = prettify(ua.name);
      switch (ua.name) {
        case "check_answer": {
          const correct = ua.context?.selected === ua.context?.correct;
          label = correct
            ? "Check answer → looks right!"
            : "Check answer → not quite";
          break;
        }
        case "practice_more":
          label = "Practice another question";
          break;
        case "new_topic":
          label = "Start a new topic";
          break;
      }

      agent.addMessage({
        id: crypto.randomUUID(),
        role: "user",
        content: label,
      });

      void agent
        .runAgent({ forwardedProps: { a2uiAction: message } })
        .catch((err) => console.warn("[tutor-workspace] runAgent failed", err));
    },
    [agent],
  );

  return (
    <div className="h-full flex flex-col">
      {/* App-owned widget: reads the "playground" data model straight off the
       * surface bus, independent of the A2UI catalog below. Only mounted once
       * the agent has actually pushed a playground spec — before that, the
       * lesson card owns the full workspace instead of a dead half-screen. */}
      {hasPlayground && (
        <div className="flex-1 min-h-0">
          <Playground channel={CHANNEL} />
        </div>
      )}

      <div
        className={
          hasPlayground
            ? "shrink-0 max-h-[48%] overflow-y-auto border-t border-[var(--line)] bg-[var(--surface)]"
            : "flex-1 min-h-0 overflow-y-auto bg-[var(--surface)]"
        }
      >
        <A2UIProvider catalog={catalog} onAction={onAction}>
          <LessonSurface
            consumedRev={consumedRev}
            onRevisionChange={handleRevisionChange}
            fillHeight={!hasPlayground}
          />
        </A2UIProvider>
      </div>
    </div>
  );
}

function LessonSurface({
  consumedRev,
  onRevisionChange,
  fillHeight,
}: {
  consumedRev: number | null;
  onRevisionChange: (rev: number) => void;
  fillHeight: boolean;
}) {
  const actions = useA2UIActions();
  const [hasLesson, setHasLesson] = useState(false);
  const [revision, setRevision] = useState(0);
  const seenRef = useRef(0);
  const createdRef = useRef<Set<string>>(new Set());

  const applyOps = useCallback(
    (ops: Array<Record<string, unknown>>) => {
      if (!ops.length) return;
      let touchedLesson = false;
      const out = ops.filter((op) => {
        const cs = op.createSurface as { surfaceId?: string } | undefined;
        if (cs?.surfaceId) {
          if (createdRef.current.has(cs.surfaceId)) return false;
          createdRef.current.add(cs.surfaceId);
        }
        const uc = op.updateComponents as { surfaceId?: string } | undefined;
        if (cs?.surfaceId === LESSON_SURFACE || uc?.surfaceId === LESSON_SURFACE) {
          touchedLesson = true;
        }
        return true;
      });
      try {
        actions.processMessages(out);
      } catch (err) {
        console.warn("[lesson-surface] processMessages threw:", err);
      }
      if (touchedLesson) {
        setHasLesson(true);
        setRevision((r) => r + 1);
      }
    },
    [actions],
  );

  useEffect(() => {
    const initial = surfaceBus.snapshot(CHANNEL);
    if (initial.ops.length) {
      applyOps(initial.ops as Array<Record<string, unknown>>);
      seenRef.current = initial.ops.length;
    }
    return surfaceBus.subscribe(CHANNEL, (snap) => {
      const tail = snap.ops.slice(seenRef.current);
      if (tail.length) applyOps(tail as Array<Record<string, unknown>>);
      seenRef.current = snap.ops.length;
    });
  }, [applyOps]);

  useEffect(() => {
    onRevisionChange(revision);
  }, [revision, onRevisionChange]);

  if (!hasLesson) {
    return (
      <div
        className={
          fillHeight
            ? "h-full flex flex-col items-center justify-center p-8 text-center text-[13px] text-[var(--ink)]/70"
            : "p-6 text-center text-[13px] text-[var(--ink)]/70"
        }
      >
        <p className="mono uppercase tracking-[0.14em] text-[11px]">
          waiting for sage
        </p>
        <p className="mt-1 max-w-sm">
          Tell Sage what you&rsquo;d like to learn — the lesson unfolds here,
          one step at a time.
        </p>
      </div>
    );
  }

  if (consumedRev === revision) {
    return (
      <div
        className={
          fillHeight
            ? "h-full flex items-center justify-center gap-3 text-[13px] text-[var(--ink)]/70"
            : "p-6 flex items-center gap-3 text-[13px] text-[var(--ink)]/70"
        }
      >
        <span className="relative inline-flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--lilac)] opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--lilac)]" />
        </span>
        <span>Sage is thinking&hellip;</span>
      </div>
    );
  }

  return (
    <div
      className={
        fillHeight
          ? "a2ui-surface p-6 md:p-8 max-w-3xl mx-auto"
          : "a2ui-surface p-5"
      }
    >
      <A2UIRenderer surfaceId={LESSON_SURFACE} />
    </div>
  );
}
