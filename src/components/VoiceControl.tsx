"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useAIAgent,
  useTranscript,
  useVocalBridge,
} from "@vocalbridgeai/react";
import { ConnectionState } from "@vocalbridgeai/sdk";
import { useAgent } from "@copilotkit/react-core/v2";
import { clsx } from "clsx";
import { surfaceBus } from "@/a2ui/surface-bus";
import type { A2UIOp } from "@/a2ui/surface-bus";

const LESSON_SURFACE = "lesson-card";

/** Pull a spoken-friendly paragraph out of a rendered lesson card's A2UI
 * components: the heading, the body text, list items, and callout bodies —
 * skipping the tiny ALL-CAPS overline label. This is what the voice agent
 * speaks, so it narrates the same lesson the workspace shows. */
function extractSpokenText(components: Array<Record<string, unknown>>): string {
  const parts: string[] = [];
  for (const c of components) {
    const kind = c.component;
    if (kind === "Overline") continue;
    if ((kind === "Heading" || kind === "Text") && typeof c.text === "string") {
      parts.push(c.text);
    } else if (kind === "Callout" && typeof c.body === "string") {
      parts.push(c.body);
    } else if (kind === "BulletList" && Array.isArray(c.items)) {
      parts.push((c.items as unknown[]).filter((i) => typeof i === "string").join(". "));
    }
  }
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  // Keep it to a sensible spoken length.
  return text.length > 700 ? text.slice(0, 700).replace(/\s+\S*$/, "") + "…" : text;
}

/** Resolve with the spoken text of the next lesson card rendered on `channel`
 * after the call, or null on timeout. Subscribes immediately so it can't miss
 * an op that lands between now and when the agent run streams in. */
function waitForNextLessonText(
  channel: string,
  timeoutMs: number,
): Promise<string | null> {
  const start = surfaceBus.snapshot(channel).ops.length;
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: string | null) => {
      if (done) return;
      done = true;
      unsub();
      clearTimeout(timer);
      resolve(v);
    };
    const unsub = surfaceBus.subscribe(channel, (snap) => {
      for (const op of snap.ops.slice(start) as A2UIOp[]) {
        const uc = op.updateComponents as
          | { surfaceId?: string; components?: Array<Record<string, unknown>> }
          | undefined;
        if (uc?.surfaceId === LESSON_SURFACE && Array.isArray(uc.components)) {
          const text = extractSpokenText(uc.components);
          if (text) finish(text);
        }
      }
    });
    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}

/**
 * Live microphone input level (0..1) for the given device while `active`.
 * Opens its own short-lived getUserMedia stream purely to VISUALIZE capture —
 * independent of the track Vocal Bridge publishes — so the learner can see
 * whether a given input device is actually picking up sound. Pass a
 * `deviceId` to probe a specific mic (empty = system default).
 */
function useMicLevel(active: boolean, deviceId: string): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!active || typeof navigator === "undefined") {
      setLevel(0);
      return;
    }
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(s);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / buf.length);
          // Scale up — speech RMS is small; clamp to 1.
          setLevel(Math.min(1, rms * 4));
          raf = requestAnimationFrame(tick);
        };
        tick();
      })
      .catch((err) => console.warn("[voice] mic level probe failed", err));

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
    };
  }, [active, deviceId]);

  return level;
}

const CHANNEL = "sage_tutor";

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

/** Turn a Vocal Bridge error code into a one-line hint the learner can act on. */
function errorHint(code: string): string {
  switch (code) {
    case "TOKEN_FETCH_FAILED":
      return "Voice needs a Vocal Bridge agent id — set VOCALBRIDGE_AGENT_ID in .env.";
    case "MICROPHONE_ERROR":
      return "Microphone blocked — allow mic access for this site and retry.";
    case "USAGE_LIMIT_EXCEEDED":
      return "Vocal Bridge usage limit reached.";
    case "AGENT_NOT_FOUND":
      return "That Vocal Bridge agent id wasn't found.";
    default:
      return "Couldn't start voice — check the Vocal Bridge setup.";
  }
}

/**
 * Voice input for the tutor: a spoken question is forwarded into the SAME
 * chat thread as if typed, so Sage answers (and renders lesson cards) exactly
 * as it would from text. `useAIAgent`'s return value is what Vocal Bridge
 * speaks back immediately — before the (async, card-rendering) chat reply has
 * landed — so we return a short spoken acknowledgment rather than try to read
 * the eventual lesson card aloud.
 */
export function VoiceControl() {
  const { agent } = useAgent({ agentId: CHANNEL });
  const [pending, setPending] = useState(false);

  useAIAgent({
    onQuery: async (query: string) => {
      console.log("[voice] query_agent received:", query);
      setPending(true);
      agent.addMessage({
        id: crypto.randomUUID(),
        role: "user",
        content: query,
      });
      // Start listening for the lesson BEFORE the run so no op is missed, then
      // return the card's spoken text so the voice agent narrates the actual
      // lesson (in sync with the visual card) rather than improvising or
      // apologizing about a "panel" it can't see.
      const lessonText = waitForNextLessonText(CHANNEL, 20000);
      void agent
        .runAgent()
        .catch((err) => console.warn("[voice] runAgent failed", err))
        .finally(() => setPending(false));
      const spoken = await lessonText;
      return (
        spoken ??
        "I've started a lesson on that — take a look at the panel on the right."
      );
    },
  });

  const { state, connect, disconnect, error, client } = useVocalBridge();
  const { transcript } = useTranscript();
  const lastTurns = transcript.slice(-3);
  const isConnected =
    state === ConnectionState.Connected ||
    state === ConnectionState.WaitingForAgent ||
    state === ConnectionState.Reconnecting;
  const isBusy =
    state === ConnectionState.Connecting ||
    state === ConnectionState.Disconnecting;

  // Which input device Sage listens through. "" = system default (what the SDK
  // uses on connect). Picking another one switches BOTH the visual meter and
  // the track the SDK publishes, so a wrong-default-mic can be fixed in-app.
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const micLevel = useMicLevel(isConnected, deviceId);

  // Device labels are only populated after mic permission is granted, which
  // happens on connect — so enumerate once connected (and on hot-plug).
  useEffect(() => {
    if (!isConnected || typeof navigator === "undefined") return;
    const refresh = () =>
      navigator.mediaDevices
        .enumerateDevices()
        .then((list) =>
          setMicDevices(list.filter((d) => d.kind === "audioinput")),
        )
        .catch(() => {});
    refresh();
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () =>
      navigator.mediaDevices.removeEventListener("devicechange", refresh);
  }, [isConnected]);

  const pickDevice = useCallback(
    async (id: string) => {
      setDeviceId(id);
      // Point the SDK's published mic track at the same device. `client.room`
      // is LiveKit's Room; switchActiveDevice re-publishes with the new input.
      try {
        const room = (
          client as unknown as {
            room?: {
              switchActiveDevice?: (
                kind: MediaDeviceKind,
                deviceId: string,
              ) => Promise<void>;
            };
          }
        )?.room;
        if (id && room?.switchActiveDevice) {
          await room.switchActiveDevice("audioinput", id);
        }
      } catch (err) {
        console.warn("[voice] switchActiveDevice failed", err);
      }
    },
    [client],
  );

  const toggle = useCallback(() => {
    void (isConnected ? disconnect() : connect()).catch((err) =>
      console.warn("[voice] connect/disconnect failed", err),
    );
  }, [isConnected, connect, disconnect]);

  const label = isBusy
    ? state === ConnectionState.Connecting
      ? "Connecting…"
      : "Ending…"
    : isConnected
      ? "Listening — tap to stop"
      : "Talk to Sage";

  const micLive = micLevel > 0.08;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={pending || isBusy}
        style={
          isConnected
            ? { backgroundColor: "#0a5d44", color: "#ffffff" }
            : { backgroundColor: "#7c70f5", color: "#ffffff" }
        }
        className={clsx(
          "w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-full text-[13px] mono uppercase tracking-[0.08em] font-medium transition disabled:opacity-60 shadow-sm hover:brightness-110",
        )}
        title="Ask Sage by voice (Vocal Bridge)"
      >
        <span className="relative inline-flex" aria-hidden>
          {isConnected && (
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#85ecce] opacity-70 animate-ping" />
          )}
          <MicIcon className="text-white" />
        </span>
        {label}
      </button>
      {error && (
        <p
          className="text-[11px] leading-snug text-[var(--red)] px-1"
          title={`${error.code}: ${error.message}`}
        >
          {errorHint(error.code)}
        </p>
      )}

      {/* Live diagnostics while voice is active: mic device + level, connection
       * state, and the last few transcript turns. */}
      {(isConnected || isBusy) && (
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink)]/50">
              voice · {state}
            </span>
            <span className="flex items-center gap-1" title="Your mic input level">
              <span className="mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink)]/40">
                mic
              </span>
              <span className="relative h-1.5 w-16 rounded-full bg-[var(--line)] overflow-hidden">
                <span
                  className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-75"
                  style={{
                    width: `${Math.round(micLevel * 100)}%`,
                    backgroundColor: micLive ? "#0a5d44" : "#c4c4cc",
                  }}
                />
              </span>
            </span>
          </div>

          {/* Mic picker — the fix for "Sage can't hear me": if the meter above
           * stays flat, try another device until it jumps when you speak. */}
          {micDevices.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink)]/40">
                microphone
              </span>
              <select
                value={deviceId}
                onChange={(e) => void pickDevice(e.target.value)}
                className="w-full text-[11px] rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] px-2 py-1"
              >
                <option value="">System default</option>
                {micDevices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Microphone ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          )}

          {!micLive && (
            <span className="text-[10.5px] leading-snug text-[var(--orange)]">
              No mic input detected — speak, and if this stays flat, pick a
              different microphone above.
            </span>
          )}

          <div className="flex flex-col gap-1">
            {lastTurns.length === 0 ? (
              <span className="text-[11px] text-[var(--ink)]/50 italic">
                Listening — say a topic out loud…
              </span>
            ) : (
              lastTurns.map((t, i) => (
                <span key={i} className="text-[11px] leading-snug">
                  <span
                    className={clsx(
                      "mono uppercase text-[9px] tracking-[0.1em] mr-1.5",
                      t.role === "user"
                        ? "text-[var(--lilac)]"
                        : "text-[var(--mint)]",
                    )}
                  >
                    {t.role === "user" ? "you" : "sage"}
                  </span>
                  <span className="text-[var(--ink)]/80">{t.text}</span>
                </span>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
