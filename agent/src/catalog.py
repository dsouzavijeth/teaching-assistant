"""The custom A2UI catalog. Python mirror.

This must stay in sync with web/src/a2ui/catalog/definitions.ts. Only the
catalog ID and the component prop summary live here; the JSON Schema for each
component is owned by the frontend (it's where the renderers are).

The agent reads CATALOG_PROMPT to know which components exist and what they
accept; create_surface uses CATALOG_ID so the runtime resolves to our
renderers.
"""

CATALOG_ID = "https://cpk-a2ui.local/catalogs/living-tutor/v1"

CATALOG_PROMPT = """\
## Available A2UI components. Living Tutor lesson catalog

You may ONLY use the components listed here. Do not invent new component
types. All `id` values must be unique within the surface; exactly one
component must have `id: "root"`.

### Layout
- **Stack** { children: [ids], gap?: xs|sm|md|lg|xl, align?: start|center|end|stretch }
    Vertical layout. The default container for a lesson card.
- **Row** { children: [ids], gap?: xs|sm|md|lg, justify?: start|center|end|spaceBetween, align?: start|center|end }
    Horizontal layout (wraps). Use for action rows (buttons, chips).
- **Grid** { children: [ids], columns?: 1-6, gap?: xs|sm|md|lg }
    Responsive grid. Rarely needed; a Stack is usually enough for a lesson card.
- **Card** { child: id, tone?: default|lilac|mint|warning }
    Bordered, padded surface. Every lesson step renders inside exactly one Card.
- **Divider** { }
    1px line.

### Content
- **Heading** { text: string, level?: "1"|"2"|"3" }
- **Text** { text: string, tone?: default|muted, size?: sm|md|lg, weight?: regular|medium|semibold }
- **Overline** { text: string }
    Tiny ALL-CAPS mono label above a heading (e.g. the topic name).
- **Badge** { label: string, tone?: neutral|positive|warning|danger|info }
- **Callout** { body: string, title?: string, tone?: info|positive|warning|neutral }
    The "takeaway" box — the one thing to remember from this step.
- **BulletList** { items: [string], ordered?: bool }
    Key points, worked-example steps, etc.

### Rich visuals (match the layout to the idea)
- **Steps** { steps: [{title, detail?}] }
    Numbered process / how-it-works flow with connectors.
- **Timeline** { events: [{when, title, detail?}] }
    Vertical chronological timeline.
- **DataTable** { columns: [{key, label, align?}], rows: [record by column key] }
    Side-by-side comparison table.
- **StatGrid** { stats: [{value, label, caption?}], columns?: 2-4 }
    Grid of big-number stat tiles.
- **Image** { src, alt?, caption? }
    A real photo. `src` is a real URL fetched from Wikipedia — never invented.

### Interactive (use only when the surface needs it)
- **Button** { label: string, variant?: primary|secondary|ghost, action: { event: { name, context? } } }
    For a quiz, render ONE Button per answer option (not a single picker) —
    each button's action context carries that option's own literal value, so
    a click needs no data-model binding to report what was chosen.

### Rules
1. Exactly one component has id="root". Everything else must be reachable from root.
2. Every prop takes an inline literal value. This catalog has no path bindings.
3. Buttons must include an `action`. Action format:
   "action": { "event": { "name": "check_answer", "context": { "selected": "b", "correct": "a" } } }
"""
