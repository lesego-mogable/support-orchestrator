import os
import time
from typing import Optional

# ---------------------------------------------------------------------------
# Local-dev in-memory store — used when COSMOS_DB_ENDPOINT points to localhost.
# The Cosmos emulator key has 85 base64 chars, which Python 3.12 rejects.
# Production uses real Azure Cosmos DB with a valid key.
# ---------------------------------------------------------------------------
_mem_store: dict[str, dict] = {}

def _is_local() -> bool:
    endpoint = os.environ.get("COSMOS_DB_ENDPOINT", "")
    return "localhost" in endpoint or "127.0.0.1" in endpoint


_client = None
_container = None


async def _get_container():
    global _client, _container
    if _container is not None:
        return _container

    from azure.cosmos.aio import CosmosClient
    from azure.cosmos import PartitionKey

    endpoint = os.environ["COSMOS_DB_ENDPOINT"]
    key = os.environ["COSMOS_DB_KEY"]
    database_name = os.environ.get("COSMOS_DB_DATABASE", "support_db")
    container_name = os.environ.get("COSMOS_DB_CONTAINER", "sessions")

    _client = CosmosClient(url=endpoint, credential=key)
    db = await _client.create_database_if_not_exists(id=database_name)
    _container = await db.create_container_if_not_exists(
        id=container_name,
        partition_key=PartitionKey(path="/sessionId"),
        default_ttl=86400,
    )
    return _container


async def get_session(session_id: str) -> Optional[dict]:
    if _is_local():
        return _mem_store.get(session_id)

    from azure.cosmos import exceptions
    container = await _get_container()
    try:
        return await container.read_item(item=session_id, partition_key=session_id)
    except exceptions.CosmosResourceNotFoundError:
        return None


async def upsert_session(session_id: str, messages: list, current_agent: str = "router") -> dict:
    session = {
        "id": session_id,
        "sessionId": session_id,
        "messages": messages,
        "currentAgent": current_agent,
        "updatedAt": int(time.time()),
    }
    if _is_local():
        _mem_store[session_id] = session
        return session

    container = await _get_container()
    await container.upsert_item(session)
    return session


async def create_session(session_id: str) -> dict:
    return await upsert_session(session_id, [], "router")
