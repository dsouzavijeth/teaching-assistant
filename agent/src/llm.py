"""Model factory — points the ADK agent at Nebius Token Factory instead of
Gemini.

Nebius Token Factory is OpenAI-compatible, so ADK's LiteLLM connector can
reach it through LiteLLM's `openai/` provider with a custom `api_base`. This
is the same "one open model, one switch" approach the LangGraph trip-architect
example uses via langchain-openai's ChatOpenAI — here the equivalent is ADK's
`LiteLlm` wrapper.
"""
from __future__ import annotations

import os

from google.adk.models.lite_llm import LiteLlm

NEBIUS_BASE_URL = os.environ.get(
    "NEBIUS_BASE_URL", "https://api.tokenfactory.nebius.com/v1"
)

# ADK's automatic function-calling needs a model that returns CLEAN structured
# tool calls. Reasoning/Hermes-style models (Nemotron, Hermes, "-Thinking"
# variants) tend to embed calls as literal <tool_call>...</tool_call> text
# that Nebius' OpenAI-compatible layer doesn't always strip cleanly, which
# leaks fragments into the visible chat as stray text/reasoning with no card
# ever rendering. meta-llama/Llama-3.3-70B-Instruct is verified clean (plain
# structured tool_calls, no reasoning content). Confirm any change against
# GET https://api.tokenfactory.nebius.com/v1/models — the catalog changes.
NEBIUS_MODEL = os.environ.get("NEBIUS_MODEL", "meta-llama/Llama-3.3-70B-Instruct")


def get_model() -> LiteLlm:
    """Return a LiteLlm bound to Nebius Token Factory via the openai/ provider.

    Pass the result straight to `LlmAgent(model=...)`.
    """
    return LiteLlm(
        model=f"openai/{NEBIUS_MODEL}",
        api_base=NEBIUS_BASE_URL,
        api_key=os.environ["NEBIUS_API_KEY"],
    )
