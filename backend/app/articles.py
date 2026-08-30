from fastapi import APIRouter, HTTPException, Query
from db import supabase
from retry_utils import with_retry

router = APIRouter(tags=["articles"])


@router.get("/articles/search")
@with_retry()
def search_articles(q: str = Query(..., min_length=1, max_length=300), limit: int = Query(10, ge=1, le=50)):
    result = (
        supabase.table("articles")
        .select("id, title, url, published_at")
        .ilike("title", f"%{q}%")
        .not_.is_("published_at", "null")
        .order("published_at", desc=True)
        .limit(limit)
        .execute()
    )
    # Sensitivitäts-Filter nachträglich in Python, da Supabase-Client
    # kein "not exists auf verknüpfter Tabelle" direkt unterstützt
    ids = [a["id"] for a in result.data]
    if not ids:
        return result.data
    sensitive_links = (
        supabase.table("article_label")
        .select("article_id, labels!inner(is_sensitive)")
        .in_("article_id", ids)
        .eq("labels.is_sensitive", True)
        .execute()
    )
    sensitive_ids = {row["article_id"] for row in sensitive_links.data}
    return [a for a in result.data if a["id"] not in sensitive_ids]


@router.get("/articles/{article_id}")
@with_retry()
def get_article(article_id: int):
    """
    Artikel-Detail inkl. Agency-Name und verknüpfter Labels.
    """
    article_res = (
        supabase.table("articles")
        .select("id, title, url, agency_id, published_at")
        .eq("id", article_id)
        .single()
        .execute()
    )
    if not article_res.data:
        raise HTTPException(status_code=404, detail="Artikel nicht gefunden")

    article = article_res.data

    # Agency-Name auflösen (Feed liefert nur agency_id, hier zeigen wir den Namen an)
    agency_name = None
    if article.get("agency_id") is not None:
        agency_res = (
            supabase.table("agencies")
            .select("name")
            .eq("id", article["agency_id"])
            .single()
            .execute()
        )
        if agency_res.data:
            agency_name = agency_res.data["name"]
    article["agency"] = agency_name

    # Verknüpfte Labels
    link_res = (
        supabase.table("article_label")
        .select("label_id")
        .eq("article_id", article_id)
        .execute()
    )
    label_ids = [row["label_id"] for row in link_res.data]

    labels = []
    if label_ids:
        labels_res = (
            supabase.table("labels")
            .select("id, name, label_type")
            .in_("id", label_ids)
            .execute()
        )
        labels = labels_res.data

    article["labels"] = labels
    return article


@router.get("/articles/{article_id}/similar")
@with_retry()
def similar_articles(article_id: int, limit: int = Query(5, ge=1, le=20)):
    """
    Semantisch ähnliche Artikel über die Embedding-Spalte des Artikels selbst.
    match_articles kennt kein exclude_id -> wir holen limit+1 und filtern
    den Artikel selbst danach raus.
    """
    article_res = (
        supabase.table("articles")
        .select("embedding")
        .eq("id", article_id)
        .single()
        .execute()
    )
    if not article_res.data or not article_res.data.get("embedding"):
        return []

    embedding = article_res.data["embedding"]

    try:
        result = supabase.rpc(
            "match_articles",
            {"query_embedding": embedding, "match_limit": limit + 1},
        ).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    filtered = [a for a in result.data if a["id"] != article_id]
    return filtered[:limit]