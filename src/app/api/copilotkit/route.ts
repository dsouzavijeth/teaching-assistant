import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
} from "@copilotkit/runtime/v2";
import { HttpAgent } from "@ag-ui/client";

const TUTOR_AGENT_URL =
  process.env.TUTOR_AGENT_URL ?? "http://localhost:8123/tutor";

// @ag-ui/client's HttpAgent and @copilotkit/runtime's AbstractAgent drift by a
// patch version (HttpAgent is missing the newer `pendingInterrupts` field), so
// the structural types don't line up even though they're runtime-compatible.
// Cast at this one boundary rather than pinning exact versions.
const tutorAgent = new HttpAgent({ url: TUTOR_AGENT_URL }) as never;

const runtime = new CopilotRuntime({
  agents: {
    // V2 hooks that don't pass an explicit agentId fall back to "default".
    default: tutorAgent,
    sage_tutor: tutorAgent,
  },
  // The ADK agent emits the A2UI ops itself; don't inject a frontend tool.
  a2ui: { injectA2UITool: false },
});

const handler = createCopilotRuntimeHandler({
  runtime,
  basePath: "/api/copilotkit",
  mode: "single-route",
});

export { handler as POST };
