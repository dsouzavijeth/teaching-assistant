/**
 * The Living Tutor A2UI custom catalog.
 *
 * `catalog` is what we hand to the A2UI renderer on the frontend.
 * `schema` is what the agent's prompt cites so the LLM knows the
 * components + their props.
 *
 * Note: includeBasicCatalog is intentionally off — this catalog is the
 * complete lesson design system.
 */
import { createCatalog, extractSchema } from "@copilotkit/a2ui-renderer";
import type { CatalogRenderers } from "@copilotkit/a2ui-renderer";
import { CATALOG_ID, definitions } from "./definitions";
import { renderers } from "./renderers";

/* The runtime's GenericBinder inspects these Zod schemas to decide which
 * props are DYNAMIC (auto-resolved against the data model). Use the same
 * Zod major version as @copilotkit/a2ui-renderer (zod@^3.25) or it
 * silently classifies everything as STATIC and `{path}` objects leak
 * through to the renderers. */
export const catalog = createCatalog(
  definitions,
  renderers as unknown as CatalogRenderers<typeof definitions>,
  { catalogId: CATALOG_ID, includeBasicCatalog: false },
);

export const catalogSchema = extractSchema(definitions);

export { CATALOG_ID, definitions };
