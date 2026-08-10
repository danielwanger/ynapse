import os
from fastapi import APIRouter, HTTPException, Query
import httpx
from db import supabase

router = APIRouter(tags=["search"])

# URL der privaten Ynapse-Instanz, die das Embedding-Modell hält.
# Das Portfolio-Backend berechnet keine Embeddings selbst (siehe Architektur-
# entscheidung: geteiltes Modell statt Duplizierung).
PRIVATE_INSTANCE_URL = os.environ["PRIVATE_INSTANCE_URL"]
PRIVATE_INSTANCE_TOKEN = os.environ.get("PRIVATE_INSTANCE_TOKEN")  # falls die interne Route abgesichert ist


@router.get("/labels/search")
def search_labels(q: str = Query(..., min_length=1, max_length=100)):
    """
    Reine Text-Suche über Label-Namen (kein Embedding nötig).
    """
    result = (
        supabase.table("labels")
        .select("id, name, label_type")
        .ilike("name", f"%{q}%")
        .order("name")
        .limit(20)
        .execute()
    )
    return result.data


@router.get("/embeddings/search")
async def semantic_search(q: str = Query(..., min_length=1, max_length=300), limit: int = 10):
    """
    Semantische Suche: Query-Embedding wird von der privaten Instanz berechnet
    (geteiltes Modell, kein zweites e5-large im Portfolio-Backend), danach
    läuft die eigentliche Vektor-Suche gegen die Portfolio-DB.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {}
            if PRIVATE_INSTANCE_TOKEN:
                headers["Authorization"] = f"Bearer {PRIVATE_INSTANCE_TOKEN}"
            embed_res = await client.post(
                f"{PRIVATE_INSTANCE_URL}/embeddings/internal/embed",
                json={"text": q},
                headers=headers,
            )
            embed_res.raise_for_status()
            query_embedding = embed_res.json()["embedding"]
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Private Instanz für Embedding nicht erreichbar: {e}",
        )

    try:
        result = supabase.rpc(
            "match_articles",
            {"query_embedding": query_embedding, "match_limit": limit},
        ).execute()
        return result.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))