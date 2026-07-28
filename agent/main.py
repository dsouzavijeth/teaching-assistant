"""FastAPI server exposing Sage, the Living Tutor agent, over AG-UI.

Run with:  uvicorn main:app --port 8123 --reload
"""
from __future__ import annotations

import os

import uvicorn
from ag_ui_adk import ADKAgent, add_adk_fastapi_endpoint
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from src.tutor_agent import root_agent as tutor_agent  # noqa: E402

app = FastAPI(title="Sage — Living Tutor Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

tutor_adk_agent = ADKAgent(
    adk_agent=tutor_agent,
    app_name="sage_tutor",
    user_id="demo_user",
    use_in_memory_services=True,
)

add_adk_fastapi_endpoint(app, tutor_adk_agent, path="/tutor")


@app.get("/")
def root():
    return {"ok": True, "agents": {"sage_tutor": "/tutor"}}


def main():
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8123")),
        reload=True,
    )


if __name__ == "__main__":
    main()
