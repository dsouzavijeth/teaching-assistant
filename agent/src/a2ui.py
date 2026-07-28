"""Minimal A2UI v0.9 op builders.

The `copilotkit` pip package ships an identical helper for LangGraph agents,
but it serializes the envelope to a JSON STRING — fine there because
LangChain's tool results are passed through as-is. ADK's FunctionTool wraps
any tool return value that ISN'T already a dict into `{"result": <value>}`,
so returning a JSON string here would land as `{"result": "{...}"}` and the
`a2ui_operations` key would never surface at the top level the frontend's A2UI
middleware scans. `render()` therefore returns the dict directly.
"""
from __future__ import annotations

from typing import Any

A2UI_OPERATIONS_KEY = "a2ui_operations"


def create_surface(surface_id: str, catalog_id: str) -> dict[str, Any]:
    return {
        "version": "v0.9",
        "createSurface": {"surfaceId": surface_id, "catalogId": catalog_id},
    }


def update_components(surface_id: str, components: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "version": "v0.9",
        "updateComponents": {"surfaceId": surface_id, "components": components},
    }


def update_data_model(surface_id: str, data: Any, path: str = "/") -> dict[str, Any]:
    return {
        "version": "v0.9",
        "updateDataModel": {"surfaceId": surface_id, "path": path, "value": data},
    }


def render(operations: list[dict[str, Any]]) -> dict[str, Any]:
    """Wrap operations in the a2ui_operations container.

    Returns a plain dict (not a JSON string) — see the module docstring for
    why that matters specifically for ADK tools.
    """
    return {A2UI_OPERATIONS_KEY: operations}
