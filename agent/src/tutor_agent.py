"""Sage, the Living Tutor agent.

FIXED-schema pattern: typed Python tools build the A2UI surfaces and emit ops
directly (see src/a2ui.py), mirroring the LangGraph trip-architect example but
on Google ADK. Four tools, each rendering exactly one lesson step:

    explain        -> a short explanation card
    interactive    -> a live math.js Playground the learner drags a slider on
    quiz           -> a check-your-understanding question
    finish_lesson  -> a completion card

`_one_step_per_turn` (a before_model_callback) is ADK's equivalent of the
LangGraph example's OneProposalPerTurn middleware: it ENDS the invocation
right after one of the four tools fires, so the agent always pauses for the
learner instead of teaching the whole lesson autonomously. It works by having
`_mark_teaching_tool_fired` (an after_tool_callback) flag session state the
moment a teaching tool's result is recorded; before_model_callback checks that
flag on the NEXT model call ADK's auto function-calling loop would otherwise
make, and short-circuits it with an empty LlmResponse. Since that response has
no function call, ADK's runner treats it as the final answer for the
invocation and stops — see https://adk.dev/runtime/event-loop for the
"no more function calls -> generator finishes" rule this relies on.
"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from typing import Optional

from google.adk.agents import LlmAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.models import LlmRequest, LlmResponse
from google.adk.tools.base_tool import BaseTool
from google.adk.tools.tool_context import ToolContext
from google.genai import types

from src import a2ui
from src.catalog import CATALOG_ID, CATALOG_PROMPT
from src.llm import get_model

LESSON_SURFACE = "lesson-card"
PLAYGROUND_SURFACE = "playground"

# Tools that render a surface and must end the turn so the learner can respond.
ONE_SHOT_TOOLS = {
    "explain",
    "interactive",
    "quiz",
    "finish_lesson",
    "show_steps",
    "show_timeline",
    "show_comparison",
    "show_stats",
    "show_image",
}
_TURN_FIRED_KEY = "_teaching_tool_fired"


def _mark_teaching_tool_fired(
    tool: BaseTool, args: dict, tool_context: ToolContext, tool_response: dict
) -> Optional[dict]:
    """after_tool_callback: flag session state once a one-shot tool fires.

    Returning None leaves the tool's actual response untouched — this
    callback only records that a surface was rendered this turn.
    """
    if tool.name in ONE_SHOT_TOOLS:
        tool_context.state[_TURN_FIRED_KEY] = True
    return None


def _one_step_per_turn(
    callback_context: CallbackContext, llm_request: LlmRequest
) -> Optional[LlmResponse]:
    """before_model_callback: skip the next model call if a tool already fired.

    ADK calls this before every model invocation within a run, including the
    ones after a tool result. Reading `_TURN_FIRED_KEY` here is a "dirty read"
    of the state the after_tool_callback set moments earlier in the SAME
    invocation (state commits lag one yielded event, but same-invocation
    reads see the local write immediately). Clearing the flag as soon as we
    consume it keeps it from leaking into the learner's NEXT turn.
    """
    if callback_context.state.get(_TURN_FIRED_KEY):
        callback_context.state[_TURN_FIRED_KEY] = False
        return LlmResponse(
            content=types.Content(role="model", parts=[types.Part(text="")])
        )
    return None


def _card(root_tone: str, components: list[dict]) -> list[dict]:
    """Wrap `components` (the Stack's DIRECT children, in order) in a
    Card > Stack shell. Pass any nested components (e.g. buttons inside an
    actions Row) via `_with`, not in this list — their ids must NOT also
    appear as direct Stack children or the tree stops being a DAG."""
    ids = [c["id"] for c in components]
    return [
        {"id": "root", "component": "Card", "tone": root_tone, "child": "stack"},
        {"id": "stack", "component": "Stack", "gap": "sm", "children": ids},
        *components,
    ]


def _with(components: list[dict], *extra: dict) -> list[dict]:
    """Append nested components (not direct Stack children) to a card tree."""
    return [*components, *extra]


def explain(
    topic: str,
    body: str,
    key_points: list[str],
    takeaway: str,
    analogy: str,
    badges: list[str],
    image_search: str,
) -> dict:
    """Render a short explanation card. Call ONCE per turn.

    Args:
        topic: The concept name, short, with an emoji prefix
            (e.g. "🌱 Photosynthesis", "📈 Compound interest").
        body: 3-5 vivid plain-English sentences introducing or deepening the
            concept. Concrete, surprising examples over textbook definitions.
        key_points: 2-4 short bullet points (a few words each).
        takeaway: One memorable sentence — the single thing to remember.
        analogy: A relatable "think of it like..." comparison, one or two
            sentences (e.g. "Compound interest is a snowball rolling downhill —
            it picks up snow, and then the new snow picks up snow too.").
            Only pass "" on a follow-up card that genuinely doesn't need one.
        badges: 1-3 tiny labels shown under the heading, e.g.
            ["Beginner friendly", "~3 min", "Biology"].
        image_search: A concrete Wikipedia search term for a photo of the
            subject, shown at the top of the card (e.g. "Nilgiri Mountains",
            "Photosynthesis", "Saturn", "Toda people"). Keep it a plain,
            canonical noun. For a purely abstract concept with nothing to
            picture, pass "" and no image is shown.
    """
    children: list[dict] = [
        {"id": "ov", "component": "Overline", "text": topic.upper()},
        {"id": "hd", "component": "Heading", "level": "2", "text": topic},
    ]
    extras: list[dict] = []
    if badges:
        badge_ids = [f"badge-{i}" for i in range(len(badges))]
        children.append(
            {"id": "badges", "component": "Row", "gap": "xs", "children": badge_ids}
        )
        extras.extend(
            {"id": badge_ids[i], "component": "Badge", "label": b, "tone": "neutral"}
            for i, b in enumerate(badges)
        )
    # A relevant photo up top, when the subject has one. Looked up server-side
    # so the URL is always real — see find_wikipedia_image.
    img_url = find_wikipedia_image(image_search) if image_search else None
    if img_url:
        children.append(
            {"id": "img", "component": "Image", "src": img_url, "alt": topic}
        )
    children.extend(
        [
            {"id": "body", "component": "Text", "tone": "default", "text": body},
            {"id": "points", "component": "BulletList", "items": key_points},
        ]
    )
    if analogy:
        children.append(
            {
                "id": "analogy",
                "component": "Callout",
                "tone": "positive",
                "title": "THINK OF IT LIKE…",
                "body": analogy,
            }
        )
    children.append(
        {
            "id": "take",
            "component": "Callout",
            "tone": "info",
            "title": "TAKEAWAY",
            "body": takeaway,
        }
    )
    card = _with(_card("default", children), *extras)
    return a2ui.render(
        operations=[
            a2ui.create_surface(LESSON_SURFACE, catalog_id=CATALOG_ID),
            a2ui.update_components(LESSON_SURFACE, card),
        ]
    )


def interactive(
    title: str,
    intro: str,
    expression: str,
    x_label: str,
    y_label: str,
    min_value: float,
    max_value: float,
    step: float,
    initial: float,
) -> dict:
    """Render a live Playground: a math.js expression the learner drags a
    slider over, with the chart and result recomputing instantly in the
    browser (no further turns needed for the interaction itself). Call this
    INSTEAD of explain when the concept has one tunable numeric quantity
    worth exploring hands-on. Call ONCE per turn.

    Args:
        title: Short title for the Playground (e.g. "How the rate changes the payoff").
        intro: One sentence of context shown above the slider.
        expression: A valid math.js expression in the SINGLE variable `x`.
            Inline every other constant as a literal number — do NOT
            reference any symbol besides `x` (e.g. for a $1000 principal
            over 10 years, write "1000 * (1 + x)^10" with x as the rate, not
            "P * (1 + x)^n"). Keep it well-defined across the whole
            [min_value, max_value] range (no division by zero, no negative
            log/sqrt).
        x_label: Label for the slider / chart x-axis (e.g. "Interest rate").
        y_label: Label for the chart y-axis / result (e.g. "Final amount ($)").
        min_value: Minimum slider value.
        max_value: Maximum slider value. Must be > min_value.
        step: Slider increment. Pick something that gives a smooth chart
            (e.g. a range of 50 steps across [min_value, max_value]).
        initial: Starting slider value, between min_value and max_value.
    """
    card = _card(
        "lilac",
        [
            {"id": "ov", "component": "Overline", "text": "INTERACTIVE"},
            {"id": "hd", "component": "Heading", "level": "2", "text": title},
            {"id": "body", "component": "Text", "tone": "default", "text": intro},
            {
                "id": "note",
                "component": "Callout",
                "tone": "neutral",
                "body": "Drag the slider in the Playground panel to see it change live.",
            },
        ],
    )
    payload = {
        "title": title,
        "expression": expression,
        "xLabel": x_label,
        "yLabel": y_label,
        "min": min_value,
        "max": max_value,
        "step": step,
        "initial": initial,
    }
    return a2ui.render(
        operations=[
            a2ui.create_surface(LESSON_SURFACE, catalog_id=CATALOG_ID),
            a2ui.update_components(LESSON_SURFACE, card),
            a2ui.create_surface(PLAYGROUND_SURFACE, catalog_id=CATALOG_ID),
            a2ui.update_data_model(PLAYGROUND_SURFACE, payload),
        ]
    )


def quiz(
    question: str,
    options: list[dict],
    correct_value: str,
    explanation: str,
) -> dict:
    """Render a check-your-understanding question. Call ONCE per turn.

    Args:
        question: The question text.
        options: 2-4 choices, each a dict with "label" (shown to the
            learner) and "value" (a short machine id, e.g. "a"/"b"/"c").
        correct_value: The "value" of the correct option.
        explanation: One sentence used only if they pick wrong.
    """
    option_ids = [f"opt-{i}" for i in range(len(options))]
    option_buttons = [
        {
            "id": option_ids[i],
            "component": "Button",
            "label": opt["label"],
            "variant": "secondary",
            "action": {
                "event": {
                    "name": "check_answer",
                    # Literal, inlined values — each option button carries its
                    # own answer, so the click needs no data-model binding.
                    "context": {
                        "selected": opt["value"],
                        "correct": correct_value,
                        "explanation": explanation,
                        "question": question,
                    },
                }
            },
        }
        for i, opt in enumerate(options)
    ]
    card = _with(
        _card(
            "default",
            [
                {"id": "ov", "component": "Overline", "text": "CHECK YOUR UNDERSTANDING"},
                {"id": "hd", "component": "Heading", "level": "2", "text": question},
                {
                    "id": "actions",
                    "component": "Row",
                    "gap": "sm",
                    "justify": "start",
                    "children": option_ids,
                },
            ],
        ),
        *option_buttons,
    )
    return a2ui.render(
        operations=[
            a2ui.create_surface(LESSON_SURFACE, catalog_id=CATALOG_ID),
            a2ui.update_components(LESSON_SURFACE, card),
        ]
    )


def _visual_card(overline: str, title: str, intro: str, viz: dict) -> dict:
    """Build + render a lesson card whose body is a single rich visual
    component (`viz`, already carrying id 'viz'). Shared by the show_* tools so
    they all get the same Overline/Heading/intro framing."""
    card = _card(
        "default",
        [
            {"id": "ov", "component": "Overline", "text": overline},
            {"id": "hd", "component": "Heading", "level": "2", "text": title},
            {"id": "intro", "component": "Text", "text": intro},
            viz,
        ],
    )
    return a2ui.render(
        operations=[
            a2ui.create_surface(LESSON_SURFACE, catalog_id=CATALOG_ID),
            a2ui.update_components(LESSON_SURFACE, card),
        ]
    )


def show_steps(title: str, intro: str, steps: list[dict]) -> dict:
    """Render a numbered PROCESS / how-it-works card. Call ONCE per turn.

    Reach for this instead of `explain` when the concept is a SEQUENCE of
    stages (how binary search halves the range, the steps of photosynthesis,
    how a bill becomes law).

    Args:
        title: The concept, short and vivid (emoji prefix welcome).
        intro: One sentence framing the process.
        steps: 3-6 ordered stages, each a dict {"title": str, "detail": str}
            where title is the short step name and detail is one sentence.
    """
    viz = {"id": "viz", "component": "Steps", "steps": steps}
    return _visual_card("HOW IT WORKS", title, intro, viz)


def show_timeline(title: str, intro: str, events: list[dict]) -> dict:
    """Render a chronological TIMELINE card. Call ONCE per turn.

    Reach for this when the concept unfolds over TIME (historical events, a
    story's arc, the life cycle of a star, stages of an era).

    Args:
        title: The topic, short and vivid (emoji prefix welcome).
        intro: One sentence framing the timeline.
        events: 3-6 events in order, each a dict {"when": str, "title": str,
            "detail": str} — when is the date/era label, title the headline,
            detail one sentence.
    """
    viz = {"id": "viz", "component": "Timeline", "events": events}
    return _visual_card("TIMELINE", title, intro, viz)


def show_comparison(
    title: str, intro: str, columns: list[dict], rows: list[dict]
) -> dict:
    """Render a side-by-side COMPARISON table card. Call ONCE per turn.

    Reach for this when the point is to CONTRAST things (inner vs outer
    planets, TCP vs UDP, mitosis vs meiosis).

    Args:
        title: What's being compared, short (emoji prefix welcome).
        intro: One sentence framing the comparison.
        columns: 2-4 columns, each a dict {"key": str, "label": str}. Use one
            column as the row-label (e.g. key "aspect") and the rest as the
            things being compared.
        rows: each a dict keyed by every column key, e.g. with columns
            [{"key":"aspect"},{"key":"inner"},{"key":"outer"}]:
            {"aspect": "Size", "inner": "Small, rocky", "outer": "Large, gas"}.
    """
    viz = {"id": "viz", "component": "DataTable", "columns": columns, "rows": rows}
    return _visual_card("COMPARE", title, intro, viz)


def show_stats(title: str, intro: str, stats: list[dict]) -> dict:
    """Render a grid of big-number STAT tiles. Call ONCE per turn.

    Reach for this when a few striking QUANTITIES carry the idea (the scale of
    the solar system, key facts about the human body, the numbers behind an
    algorithm's speed).

    Args:
        title: The topic, short (emoji prefix welcome).
        intro: One sentence framing the numbers.
        stats: 2-4 tiles, each a dict {"value": str, "label": str,
            "caption": str} — value is the headline number ("8", "150M km",
            "−273 °C"), label the short name, caption an optional one-liner.
    """
    viz = {"id": "viz", "component": "StatGrid", "stats": stats}
    return _visual_card("BY THE NUMBERS", title, intro, viz)


_WIKI_UA = {"User-Agent": "living-tutor/1.0 (educational demo)"}


def find_wikipedia_image(query: str) -> Optional[str]:
    """Return a real image URL for `query` from Wikipedia, or None.

    The open model can't generate images and would hallucinate URLs, so images
    are sourced HERE from a real search — Wikipedia's API, which is free, needs
    no key, and returns accurate, license-friendly images for educational
    subjects. Uses only the stdlib so the agent gains no new dependency.
    """
    q = (query or "").strip()
    if not q:
        return None
    params = urllib.parse.urlencode(
        {
            "action": "query",
            "generator": "search",
            "gsrsearch": q,
            "gsrlimit": 1,
            "prop": "pageimages",
            "piprop": "thumbnail",
            "pithumbsize": 600,
            "format": "json",
        }
    )
    url = f"https://en.wikipedia.org/w/api.php?{params}"
    try:
        req = urllib.request.Request(url, headers=_WIKI_UA)
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.load(resp)
        pages = data.get("query", {}).get("pages", {})
        for page in pages.values():
            src = page.get("thumbnail", {}).get("source")
            if src:
                return src
    except Exception:
        return None
    return None


def show_image(title: str, search: str, caption: str, note: str) -> dict:
    """Render a card with a REAL, relevant image + caption + a sentence of
    context. Call ONCE per turn.

    Reach for this whenever SEEING the subject helps — anything concrete you
    can picture: an animal, plant, food, place, landmark, planet, organ,
    artwork, historical figure, or object. The image is fetched from Wikipedia
    from your `search` term — you never supply a URL.

    Args:
        title: The subject, short (emoji prefix welcome).
        search: A concrete Wikipedia search term to fetch the image, e.g.
            "Avocado", "Saturn", "Mount Everest", "Human heart", "Mona Lisa".
            Keep it a plain noun — the more canonical, the better the match.
        caption: A short caption shown under the image.
        note: One or two sentences about what the learner is looking at.
    """
    src = find_wikipedia_image(search)
    children: list[dict] = [
        {"id": "ov", "component": "Overline", "text": title.upper()},
        {"id": "hd", "component": "Heading", "level": "2", "text": title},
    ]
    if src:
        children.append(
            {
                "id": "img",
                "component": "Image",
                "src": src,
                "alt": caption,
                "caption": caption,
            }
        )
    children.append({"id": "note", "component": "Text", "text": note})
    card = _card("default", children)
    return a2ui.render(
        operations=[
            a2ui.create_surface(LESSON_SURFACE, catalog_id=CATALOG_ID),
            a2ui.update_components(LESSON_SURFACE, card),
        ]
    )


def finish_lesson(summary: str) -> dict:
    """Close out the lesson with a completion card. Call ONCE, instead of
    explain/interactive/quiz, when the topic is fully covered or the
    learner says they're done.

    Args:
        summary: A short 2-3 line recap of what was covered.
    """
    card = _with(
        _card(
            "mint",
            [
                {"id": "ov", "component": "Overline", "text": "LESSON COMPLETE"},
                {"id": "hd", "component": "Heading", "level": "2", "text": "Nice work"},
                {"id": "sum", "component": "Text", "tone": "muted", "text": summary},
                {
                    "id": "actions",
                    "component": "Row",
                    "gap": "sm",
                    "justify": "start",
                    "children": ["more", "restart"],
                },
            ],
        ),
        {
            "id": "more",
            "component": "Button",
            "label": "Practice another question",
            "variant": "secondary",
            "action": {"event": {"name": "practice_more", "context": {}}},
        },
        {
            "id": "restart",
            "component": "Button",
            "label": "New topic",
            "variant": "ghost",
            "action": {"event": {"name": "new_topic", "context": {}}},
        },
    )
    return a2ui.render(
        operations=[
            a2ui.create_surface(LESSON_SURFACE, catalog_id=CATALOG_ID),
            a2ui.update_components(LESSON_SURFACE, card),
        ]
    )


SYSTEM_PROMPT = f"""\
You are "Sage", a warm, patient tutor who teaches ONE step at a time by
building an interactive lesson instead of replying with a wall of text. You
hold a NATURAL CONVERSATION and, only once the learner actually wants to
learn a concept, you switch to teaching mode and render exactly one step per
turn.

## Conversation mode (NO tools — just reply in chat)

Use this whenever the learner is chatting, asking a quick aside, or hasn't
named a concept they want the full walkthrough on. Reply in plain, friendly
text. Do NOT call any tool in this mode.

Examples that stay CONVERSATION:
- "hi" / "what can you do?"                    -> introduce yourself. No card.
- "what's the difference between X and Y?"     -> a short plain-text answer,
  then offer to build the full lesson. No card unless they clearly want one.

## Teaching mode (exactly ONE tool per turn)

Switch to this once the learner names a concept and wants to learn it (e.g.
"explain compound interest", "teach me binary search"). Each turn, call
EXACTLY ONE of:

1. `explain(topic, body, key_points, takeaway, analogy, badges, image_search)`
   — introduce or deepen a concept: 3-5 VIVID sentences in `body` (concrete
   examples, not textbook definitions), 2-4 short `key_points`, one memorable
   `takeaway`. On the FIRST card of a topic, always include `analogy` — a
   relatable "think of it like..." comparison — and `badges` like
   ["Beginner friendly", "~4 min", "Biology"]. Emoji in `topic` welcome
   ("🌱 Photosynthesis"). ALWAYS set `image_search` to a concrete noun that
   names the subject so a real photo appears on the card (e.g. "Nilgiri
   Mountains", "Saturn", "Toda people"); pass "" ONLY for a purely abstract
   idea with nothing to picture.
2. `interactive(title, intro, expression, x_label, y_label, min_value, max_value, step, initial)`
   — the signature move of this app: a live slider the learner drags while a
   chart recomputes instantly. Use it whenever the topic has ANY meaningful
   numeric lever, and actively LOOK for one — a rate, dose, angle,
   probability, growth factor, temperature, sample size. Examples:
   - compound interest -> "1000 * (1 + x)^10" with x = interest rate
   - projectile motion -> "20 * x - 4.9 * x^2" with x = time
   - population growth -> "100 * e^(0.5 * x)" with x = years
   - even "vegetables": daily fiber over a month -> "30 * x" with x = servings
   `expression` is a math.js expression in the SINGLE variable `x` — inline
   every other constant as a literal number. A good lesson includes at least
   one interactive step when any quantity exists; the learner's drag needs no
   further turns from you.
3. `quiz(question, options, correct_value, explanation)` — 2-4 `options`
   (each `{{label, value}}`), the `correct_value`, and a one-sentence
   `explanation` for if they get it wrong. Use this after 1-2 explain/
   interactive steps to confirm they're following before moving on. Make one
   wrong option a common real misconception, and it's fine for one to be
   playfully wrong.
4. `finish_lesson(summary)` — call ONCE, instead of the above, once the
   topic is fully covered or the learner says they're done.

### Rich visual steps — MATCH the layout to the idea

Don't make every card a wall of text. When the CONTENT has a natural shape,
reach for the matching visual tool instead of `explain`:

5. `show_steps(title, intro, steps)` — a numbered PROCESS. Use for "how X
   works" / ordered stages (how binary search halves the range, the steps of
   photosynthesis). `steps` = 3-6 dicts {{"title", "detail"}}.
6. `show_timeline(title, intro, events)` — a chronological TIMELINE. Use for
   history, a story's arc, a life cycle. `events` = 3-6 dicts
   {{"when", "title", "detail"}} in order.
7. `show_comparison(title, intro, columns, rows)` — a side-by-side TABLE. Use
   to contrast things (inner vs outer planets, TCP vs UDP). `columns` = 2-4
   dicts {{"key", "label"}} (one column is the row label); `rows` = dicts keyed
   by every column key.
8. `show_stats(title, intro, stats)` — a grid of big-NUMBER tiles. Use when a
   few striking quantities carry the idea. `stats` = 2-4 dicts
   {{"value", "label", "caption"}}.
9. `show_image(title, search, caption, note)` — a card with a REAL photo of
   the subject (fetched from Wikipedia via your `search` term — you never
   supply a URL). Use whenever SEEING it helps: an animal, plant, food, place,
   landmark, planet, organ, artwork, or historical figure.

Choosing well is what makes a lesson feel alive: a process → show_steps, a
chronology → show_timeline, a contrast → show_comparison, key numbers →
show_stats, something you can picture → show_image, a tunable quantity →
interactive. `explain` is the versatile default ONLY when none of those fit.

STRONGLY prefer a visual tool over plain `explain` whenever the topic has any
structure or a concrete subject. Examples:
- "nutritional value of fruits" -> show_stats (calories, vitamin C, fiber) or
  show_comparison (apple vs banana vs orange), then maybe show_image.
- "the water cycle" -> show_steps.
- "tell me about avocados" -> show_image + a couple of facts.
Reserve bare `explain` for genuinely abstract ideas with no natural shape.

STOP after that one call. The turn ends automatically — wait for the learner.

A typical great lesson mixes shapes, e.g.: show_image or explain (with
analogy) -> show_steps or interactive -> quiz -> show_comparison or show_stats
-> quiz -> finish_lesson. Vary it; don't repeat the same shape twice in a row
when a different one fits better.

Reacting to events (delivered as a tool result describing the learner's
click):
- `check_answer` -> context carries `selected`, `correct`, `explanation`,
  `question`. If `selected == correct`, praise briefly then move to the NEXT
  concept (`explain` or `interactive`). If wrong, briefly say so, use the
  `explanation`, and either `explain` the point from a different angle or
  `quiz` again with an easier question — never repeat the identical quiz.
- `practice_more` -> `quiz` on the same topic, a fresh question.
- `new_topic` -> the lesson was cleared. Ask what they'd like to learn next
  (conversation mode).

## Voice & style

- Warm, playful, concrete. Sound like a favorite teacher, not a textbook.
- Prefer real, surprising examples ("a credit card at 24% doubles your debt
  in ~3 years") over generic ones.
- One emoji per card, in the topic/title, is welcome. Don't overdo it.

## Hard rules

- Choose ONE mode per turn. NEVER explain in chat text AND call a teaching
  tool in the same turn.
- Exactly one teaching tool call per turn while teaching.
- Keep chat text short and warm — the card carries the detail.
- In `interactive`, never pick a range where the expression divides by zero,
  or takes a negative log/sqrt, anywhere in [min_value, max_value].

{CATALOG_PROMPT}
"""


def build_tutor_agent() -> LlmAgent:
    return LlmAgent(
        name="sage_tutor",
        model=get_model(),
        instruction=SYSTEM_PROMPT,
        tools=[
            explain,
            interactive,
            quiz,
            show_steps,
            show_timeline,
            show_comparison,
            show_stats,
            show_image,
            finish_lesson,
        ],
        after_tool_callback=_mark_teaching_tool_fired,
        before_model_callback=_one_step_per_turn,
    )


root_agent = build_tutor_agent()
