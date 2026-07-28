/**
 * A2UI custom catalog. platform-agnostic component definitions.
 *
 * These are the components the tutor agent is allowed to use — one lesson
 * card at a time (explain / interactive intro / quiz / finish). Each entry
 * pairs a Zod prop schema with a description. The same definitions are
 * shipped to:
 *   - the frontend renderer (paired with React renderers in renderers.tsx)
 *   - the backend agent (the prompt builder reads the JSON-shape via
 *     the mirrored prose in agent/src/catalog.py)
 *
 * Catalog ID is constant and shared with the Python tools so createSurface
 * resolves to the right component map on the client.
 */
import { z } from "zod";

export const CATALOG_ID = "https://cpk-a2ui.local/catalogs/living-tutor/v1";

/* `child` and `children` refer to component IDs (resolved at render time). */
const childRef = z.string();
const childrenRef = z.array(z.string());

export const definitions = {
  Stack: {
    description:
      "Vertical layout. Children stack top→bottom with consistent gap. The default container for a lesson card's contents.",
    props: z.object({
      children: childrenRef,
      gap: z.enum(["xs", "sm", "md", "lg", "xl"]).optional(),
      align: z.enum(["start", "center", "end", "stretch"]).optional(),
    }),
  },

  Row: {
    description:
      "Horizontal layout. Children sit side-by-side; wraps on small screens. Use for action rows (buttons, chips).",
    props: z.object({
      children: childrenRef,
      gap: z.enum(["xs", "sm", "md", "lg"]).optional(),
      justify: z.enum(["start", "center", "end", "spaceBetween"]).optional(),
      align: z.enum(["start", "center", "end"]).optional(),
    }),
  },

  Grid: {
    description:
      "Responsive grid. Children fill columns left→right. Rarely needed — a Stack is usually enough for a lesson card.",
    props: z.object({
      children: childrenRef,
      columns: z.number().int().min(1).max(6).optional(),
      gap: z.enum(["xs", "sm", "md", "lg"]).optional(),
    }),
  },

  Card: {
    description:
      "Bordered, rounded surface with padding. Every lesson step renders inside exactly one Card. Pass a child layout (Stack/Row/Grid) as `child`.",
    props: z.object({
      child: childRef,
      tone: z.enum(["default", "lilac", "mint", "warning"]).optional(),
    }),
  },

  Divider: {
    description: "A 1px line. No props.",
    props: z.object({}),
  },

  Heading: {
    description:
      "Step or section title. Use level 2 for the main heading of a lesson card.",
    props: z.object({
      text: z.string(),
      level: z.enum(["1", "2", "3"]).optional(),
    }),
  },

  Text: {
    description:
      "Body copy. Use tone='muted' for secondary text. Use size='sm' for captions.",
    props: z.object({
      text: z.string(),
      tone: z.enum(["default", "muted"]).optional(),
      size: z.enum(["sm", "md", "lg"]).optional(),
      weight: z.enum(["regular", "medium", "semibold"]).optional(),
    }),
  },

  Overline: {
    description:
      "Tiny ALL-CAPS mono label that sits above a heading. Use for the topic name or step kind (e.g. 'INTERACTIVE').",
    props: z.object({ text: z.string() }),
  },

  Badge: {
    description:
      "Small inline status pill. Use tone to imply meaning (positive=green, warning=amber, neutral=lilac).",
    props: z.object({
      label: z.string(),
      tone: z
        .enum(["neutral", "positive", "warning", "danger", "info"])
        .optional(),
    }),
  },

  Callout: {
    description:
      "Block-level highlight for the lesson's takeaway or a hint. Tone picks the accent color (info=lilac, positive=green, warning=amber, neutral=grey).",
    props: z.object({
      body: z.string(),
      title: z.string().optional(),
      tone: z.enum(["info", "positive", "warning", "neutral"]).optional(),
    }),
  },

  BulletList: {
    description:
      "Bulleted or numbered list. Use for key points or worked-example steps.",
    props: z.object({
      items: z.array(z.string()),
      ordered: z.boolean().optional(),
    }),
  },

  Button: {
    description:
      "Action button. Variant 'primary' is the main CTA (dark). 'secondary' is outlined. 'ghost' is borderless. For a quiz, render one Button per answer option — each carries its own literal value in the action context, so no data-model binding is needed to report the click.",
    props: z.object({
      label: z.string(),
      variant: z.enum(["primary", "secondary", "ghost"]).optional(),
      action: z.object({
        event: z.object({
          name: z.string(),
          context: z.record(z.string(), z.unknown()).optional(),
        }),
      }),
    }),
  },
};

export type Definitions = typeof definitions;
