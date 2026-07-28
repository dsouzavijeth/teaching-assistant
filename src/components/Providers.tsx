"use client";

import { CopilotKit } from "@copilotkit/react-core/v2";
import { VocalBridgeProvider } from "@vocalbridgeai/react";
import { createMirrorActivityRenderer } from "@/a2ui/MirrorRenderer";

/* Sage sends A2UI surfaces via activity messages; the mirror renderer
 * forwards them to the page-level workspace canvas and leaves a small pill
 * in chat as the handoff breadcrumb. */
const RENDERERS = [createMirrorActivityRenderer("sage_tutor")];

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" renderActivityMessages={RENDERERS}>
      {/* Vocal Bridge: voice in/out for the tutor. The provider talks to
       * /api/voice-token (server-side proxy — see that route) rather than
       * holding an API key in the browser. */}
      <VocalBridgeProvider
        options={{
          auth: { tokenUrl: "/api/voice-token" },
          participantName: "learner",
          // Logs connection, transcript, and query_agent events to the browser
          // console — invaluable while wiring up voice. Set false for prod.
          debug: true,
        }}
      >
        {children}
      </VocalBridgeProvider>
    </CopilotKit>
  );
}
