# Sage — the Living Tutor

An interactive teaching assistant built on [A2UI](https://a2ui.org): instead of replying with walls of text, Sage builds a lesson one step at a time — a short explanation card, a live math.js **Playground** when a concept has a tunable quantity, and a check-your-understanding question — pausing after every step so the learner drives the pace. Ask by typing or **by voice**.

Adapted from [`trip-architect-a2ui`](../trip-architect-a2ui) (itself based on CopilotKit's [A2UI PDF Analyst](https://github.com/CopilotKit/CopilotKit/tree/main/examples/showcases/a2ui-pdf-analyst) example), swapping the LangGraph agent for **Google ADK**, running on an open model via **Nebius Token Factory** instead of a frontier model, and adding a **Vocal Bridge** voice layer.

## How it works

- **Agent** (`agent/`) — a Google ADK `LlmAgent` served over [AG-UI](https://docs.ag-ui.com) via `ag-ui-adk`, on Nebius Token Factory through ADK's LiteLLM connector. Nine teaching tools, one lesson step per call: `explain`, `interactive`, `quiz`, `finish_lesson`, plus five content-shaped visuals — `show_steps`, `show_timeline`, `show_comparison`, `show_stats`, `show_image`.
- **One step per turn** — a `before_model_callback` ends the run the moment one of those tools fires (ADK's equivalent of the LangGraph example's custom middleware), so Sage always pauses for the learner instead of teaching the whole lesson unattended.
- **Conversation vs. teaching** — the system prompt keeps Sage chatting plainly until the learner actually wants to learn a topic, then switches into one-step-at-a-time teaching mode. `explain` cards carry a "think of it like…" analogy and a few badges to stay lively.
- **The UI adapts to the idea** — the prompt steers Sage to match the layout to the content: a process → `show_steps` (numbered flow), a chronology → `show_timeline`, a contrast → `show_comparison` (table), key numbers → `show_stats` (big-number tiles), something you can picture → `show_image`, a tunable quantity → `interactive`. The tools build the A2UI in Python (reliable on an open model) from a custom catalog — `Card`/`Stack`/`Row`/`Grid`/`Heading`/`Text`/`Overline`/`Badge`/`Callout`/`BulletList`/`Button`/`Steps`/`Timeline`/`DataTable`/`StatGrid`/`Image` — so lessons on different topics look genuinely different.
- **Real images, no hallucinated URLs** — the open model can't generate images and would invent URLs, so images are fetched server-side from Wikipedia's API (free, no key, license-friendly) given only a search term; `find_wikipedia_image` in `tutor_agent.py` does the lookup with the stdlib alone. `explain` embeds a relevant photo up top on every card (a required `image_search` arg the model fills), and `show_image` renders a dedicated photo step — so images appear reliably instead of depending on the model choosing an image tool.
- **The Playground** is the standout piece: `interactive(...)` hands the frontend a math.js expression in one variable (`x`) plus a slider range via an A2UI `update_data_model` op. The `Playground` React widget (app-owned, outside the catalog) reads that spec straight off the surface bus and recomputes the chart + result **entirely in the browser** — no round-trip to the model while dragging. The workspace shows the Playground pane only once a spec exists; until then the lesson card gets the full height, floating on a soft ambient backdrop with a card-entrance animation.
- **Voice** — [Vocal Bridge](https://vocalbridgeai.com) in *AI Agent Integration* mode. A spoken question is delegated over the data channel into the browser (`useAIAgent`), forwarded into the same chat thread Sage already answers in, and Sage's reply is **spoken aloud** — the rendered lesson's text when Sage teaches, or the plain chat reply (e.g. a clarifying question) when Sage stays in conversation mode. See [Voice setup](#voice-setup-optional).

## Project layout

```
agent/                       Python — Google ADK agent
  main.py                    FastAPI + ag-ui-adk endpoint at /tutor
  src/
    llm.py                   LiteLlm -> Nebius Token Factory
    a2ui.py                  A2UI v0.9 op builders (returns a dict, not a JSON
                             string — ADK wraps non-dict tool returns)
    catalog.py               Catalog prompt (mirrors src/a2ui/catalog/definitions.ts)
    tutor_agent.py           The 9 teaching tools, image lookup, one-step-per-turn callbacks, system prompt

src/                         Next.js frontend
  app/
    tutor/page.tsx           Chat (+ voice bar) | workspace split
    api/copilotkit/route.ts  CopilotKit runtime -> agent/main.py
    api/voice-token/route.ts Server-side Vocal Bridge token proxy (adds X-Agent-Id)
  a2ui/
    catalog/                 Zod defs + React renderers for the lesson catalog
    surface-bus.ts           Mirrors A2UI ops from chat into the workspace
  components/
    TutorWorkspace.tsx       Lesson-card surface + Playground (adaptive layout,
                             ambient backdrop, card-entrance motion)
    Playground.tsx           mathjs + recharts live slider widget
    VoiceControl.tsx         Voice: connect button, mic-device picker, live level
                             meter, transcript; narrates the lesson or chat reply
```

## Setup

There are **two** `.env` files: `agent/.env` (Python, model key) and the project-root `.env` (Next.js: agent URL + voice keys).

### 1. Agent

```bash
cd agent
uv sync
cp .env.example .env   # add NEBIUS_API_KEY (from https://tokenfactory.nebius.com/)
```

### 2. Frontend

```bash
cp .env.example .env   # NEXT root env: TUTOR_AGENT_URL is preset; add voice keys
                       # (VOCALBRIDGE_API_KEY, VOCALBRIDGE_AGENT_ID) if using voice,
                       # or leave them blank to skip voice entirely
pnpm install           # also runs `uv sync` in agent/ via postinstall
```

### 3. Run both

```bash
pnpm dev
```

This starts the Next.js app at `http://localhost:3000` (redirects to `/tutor`) and the agent at `http://localhost:8123`.

> **Restarts:** the Next.js frontend hot-reloads, but **`.env` changes and any edit to the Python agent require a full `pnpm dev` restart** — env vars and Python only load at startup. (uvicorn's `--reload` has also proven flaky on Windows; when in doubt, restart.)

## Voice setup (optional)

Voice uses Vocal Bridge's *AI Agent Integration* mode: the voice agent handles greetings/small talk and **delegates learning questions** to Sage.

1. **Create a Vocal Bridge account** and API key at [vocalbridgeai.com](https://vocalbridgeai.com). The free tier includes 50 minutes and **1 agent** (no card required).
2. **Create the voice agent in the dashboard** (API creation is paywalled; the dashboard is free). Choose **"An AI agent"** integration mode. Set *When to delegate* to route topic/learning questions to your agent, and turn **"Speak responses verbatim" ON** so it narrates Sage's reply faithfully. With verbatim OFF the concierge paraphrases and blends in its own knowledge — if you want a strict relay, also tell it (in its instructions) to *never answer from its own knowledge, delegate every question, and add no commentary beyond a brief "one moment."*
3. **Get the agent id** — `GET https://vocalbridgeai.com/api/v1/agents` with your key returns it, or it's in the dashboard.
4. **Fill the root `.env`:**
   ```
   VOCALBRIDGE_API_KEY=vb_...
   VOCALBRIDGE_AGENT_ID=<the agent id>   # account-scoped keys REQUIRE this
   ```
   The token route (`api/voice-token`) sends it as the `X-Agent-Id` header — without it Vocal Bridge returns `TOKEN_FETCH_FAILED`.
5. **Restart `pnpm dev`**, click **Talk to Sage** (top of the chat column), allow the mic, and speak.

**Diagnostics built into the voice bar:** connection state, a live **mic-level meter**, a **microphone picker** (Windows often defaults to the wrong input device — pick the one that makes the meter jump when you speak, and the SDK re-publishes on that device), and the live transcript. `debug: true` on the provider also logs every SDK event (token, mic, transcript, `query_agent`) to the browser console.

## Notes

- **Model choice**: `NEBIUS_MODEL` defaults to `meta-llama/Llama-3.3-70B-Instruct` in `agent/src/llm.py` — clean structured tool calls, no reasoning traces. `nvidia/Nemotron-3-Nano-Omni` also works well and tends to write richer analogies (it does emit visible "thinking" bubbles). What to avoid: some larger reasoning models embed tool calls as literal `<tool_call>…</tool_call>` text that Nebius' OpenAI-compatible layer doesn't strip cleanly (we hit this with `nvidia/nemotron-3-super-120b-a12b`) — the fragments leak into the chat and the lesson never renders, with no error. Always confirm a model id exists on your account first: `curl https://api.tokenfactory.nebius.com/v1/models -H "Authorization: Bearer $NEBIUS_API_KEY"` — the catalog changes.
- **A2UI tool returns**: `a2ui.render()` returns a plain `dict` (not a JSON string). ADK auto-wraps any non-dict tool return in `{"result": …}`, which would bury the `a2ui_operations` key one level too deep and the surface would never render. Framework-specific gotcha worth remembering if you port more tools.
- **Voice is fully optional**: leave `VOCALBRIDGE_API_KEY` blank and the mic button simply shows a friendly hint; typed chat is unaffected.
