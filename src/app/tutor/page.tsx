"use client";

import { CopilotChat, useAgent } from "@copilotkit/react-core/v2";
import { Split } from "@/components/Split";
import { TutorWorkspace } from "@/components/TutorWorkspace";
import { VoiceControl } from "@/components/VoiceControl";

const AGENT_ID = "sage_tutor";

export default function TutorPage() {
  // Ensures the agent thread is registered for this page.
  useAgent({ agentId: AGENT_ID });

  return (
    <div className="h-screen flex flex-col bg-[var(--bg)]">
      <header className="shrink-0 px-5 py-3 border-b border-[var(--line)] flex items-center gap-2">
        <span className="font-semibold tracking-tight text-[var(--ink)]">
          Sage
        </span>
        <span className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink)]/60">
          the living tutor · A2UI
        </span>
      </header>

      <Split
        persistKey="tutor.split"
        initialLeftFraction={0.34}
        left={
          <div className="h-full flex flex-col">
            {/* Voice sits at the top of the chat column — where the learner's
             * attention already is — instead of a corner that's easy to miss. */}
            <div className="shrink-0 px-4 py-3 border-b border-[var(--line)] bg-[var(--surface)]">
              <VoiceControl />
            </div>
            <div className="flex-1 min-h-0 copilot-chat-wrapper">
              <CopilotChat
                agentId={AGENT_ID}
                labels={{
                  chatInputPlaceholder: "What do you want to learn?",
                  welcomeMessageText:
                    "Tell me a topic — I'll build the lesson one step at a time: an explanation, something to try, and a quick check before we move on.",
                }}
              />
            </div>
          </div>
        }
        right={<TutorWorkspace />}
      />
    </div>
  );
}
