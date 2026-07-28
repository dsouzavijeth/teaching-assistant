import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side proxy for Vocal Bridge's connection-token endpoint. Keeps
 * VOCALBRIDGE_API_KEY out of the browser: <VocalBridgeProvider options={{
 * auth: { tokenUrl: "/api/voice-token" } }}> calls this route, which is the
 * only place the real API key is used.
 *
 * Account-scoped keys (the `vb_...` kind) MUST also name which voice agent to
 * connect to via the `X-Agent-Id` header — otherwise Vocal Bridge returns
 * 400 "X-Agent-Id header required". Set VOCALBRIDGE_AGENT_ID in the root .env
 * to the id of an agent you've created at https://vocalbridgeai.com (or via
 * the `vb` CLI: `pip install vocal-bridge`, then `vb agent list`).
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.VOCALBRIDGE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "VOCALBRIDGE_API_KEY is not configured on the server" },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const participantName =
    typeof body?.participant_name === "string" && body.participant_name
      ? body.participant_name
      : "learner";

  const headers: Record<string, string> = {
    "X-API-Key": apiKey,
    "Content-Type": "application/json",
  };
  // Required for account-scoped keys; harmless if the key is agent-scoped.
  const agentId = process.env.VOCALBRIDGE_AGENT_ID;
  if (agentId) headers["X-Agent-Id"] = agentId;

  const upstream = await fetch("https://vocalbridgeai.com/api/v1/token", {
    method: "POST",
    headers,
    body: JSON.stringify({ participant_name: participantName }),
  });

  const data = await upstream.json().catch(() => null);
  return NextResponse.json(data, { status: upstream.status });
}
