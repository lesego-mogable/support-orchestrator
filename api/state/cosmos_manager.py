import os
import time
from typing import Optional
from azure.cosmos.aio import CosmosClient
from azure.cosmos import PartitionKey, exceptions


_client: Optional[CosmosClient] = None
_container = None


async def _get_container():
    global _client, _container
    if _container is not None:
        return _container

    endpoint = os.environ["COSMOS_DB_ENDPOINT"]
    key = os.environ["COSMOS_DB_KEY"]
    database_name = os.environ.get("COSMOS_DB_DATABASE", "support_db")
    container_name = os.environ.get("COSMOS_DB_CONTAINER", "sessions")

    _client = CosmosClient(url=endpoint, credential=key)
    db = await _client.create_database_if_not_exists(id=database_name)
    _container = await db.create_container_if_not_exists(
        id=container_name,
        partition_key=PartitionKey(path="/sessionId"),
        default_ttl=86400,  # sessions expire after 24 hours
    )
    return _container


async def get_session(session_id: str) -> Optional[dict]:
    container = await _get_container()
    try:
        item = await container.read_item(item=session_id, partition_key=session_id)
        return item
    except exceptions.CosmosResourceNotFoundError:
        return None


async def upsert_session(session_id: str, messages: list, current_agent: str = "router") -> dict:
    container = await _get_container()
    session = {
        "id": session_id,
        "sessionId": session_id,
        "messages": messages,
        "currentAgent": current_agent,
        "updatedAt": int(time.time()),
    }
    await container.upsert_item(session)
    return session


async def create_session(session_id: str) -> dict:
    return await upsert_session(session_id, [], "router")
