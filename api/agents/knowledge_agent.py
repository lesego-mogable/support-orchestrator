"""
Knowledge Base Agent — calls the rag-engine service for grounded answers.
Falls back to a helpful message if the rag-engine is not reachable.
Set RAG_ENGINE_URL in local.settings.json to point at your running rag-engine.
"""
import os
import time
import logging

import httpx

logger = logging.getLogger(__name__)

RAG_ENGINE_URL = os.environ.get("RAG_ENGINE_URL", "http://localhost:8000")


async def run_knowledge_agent(user_message: str, history: list[dict]) -> tuple[str, list[dict]]:
    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{RAG_ENGINE_URL}/api/v1/query",
                json={"query": user_message},
            )
            response.raise_for_status()
            data = response.json()

        ms = int((time.monotonic() - start) * 1000)
        answer = data.get("answer", "No relevant information found.")
        trace = {
            "fn": f"KnowledgeBase.search_documents(query={user_message!r})",
            "result": answer[:200],
            "ms": ms,
        }
        return answer, [trace]

    except httpx.ConnectError:
        ms = int((time.monotonic() - start) * 1000)
        logger.warning("rag-engine not reachable at %s", RAG_ENGINE_URL)
        answer = (
            "I wasn't able to reach the knowledge base right now. "
            "Please ensure the rag-engine service is running, or try rephrasing your question "
            "so I can route you to a more specific support agent."
        )
        trace = {
            "fn": f"KnowledgeBase.search_documents(query={user_message!r})",
            "result": f"connection_error: rag-engine unreachable at {RAG_ENGINE_URL}",
            "ms": ms,
        }
        return answer, [trace]

    except Exception as exc:
        ms = int((time.monotonic() - start) * 1000)
        logger.exception("Knowledge agent error")
        answer = "I encountered an error searching the knowledge base. Please try again or contact support."
        trace = {
            "fn": f"KnowledgeBase.search_documents(query={user_message!r})",
            "result": f"error: {exc}",
            "ms": ms,
        }
        return answer, [trace]
