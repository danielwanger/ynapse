from fastapi import APIRouter, HTTPException
from db import supabase
from retry_utils import with_retry

router = APIRouter(tags=["hub"])


@router.get("/labels/{label_id}/hub")
@with_retry()
def get_label_hub(label_id: int):
    """
    Metadaten für die Hub-Seite eines Labels: Name/Typ, direkte Eltern-
    und Kind-Labels aus der Taxonomie (für Breadcrumb + Unterthemen-Liste),
    plus Artikel-Anzahl. Der eigentliche Artikel-Feed wird separat über
    /feed/ geladen (gleiche Filterlogik wie überall sonst).
    """
    label_res = (
        supabase.table("labels")
        .select("id, name, label_type")
        .eq("id", label_id)
        .single()
        .execute()
    )
    if not label_res.data:
        raise HTTPException(status_code=404, detail="Label nicht gefunden")

    label = label_res.data

    parent_rels = (
        supabase.table("label_relationships")
        .select("parent_id")
        .eq("child_id", label_id)
        .execute()
        .data
    )
    parent_ids = [r["parent_id"] for r in parent_rels]
    parents = []
    if parent_ids:
        parents = (
            supabase.table("labels")
            .select("id, name")
            .in_("id", parent_ids)
            .execute()
            .data
        )

    child_rels = (
        supabase.table("label_relationships")
        .select("child_id")
        .eq("parent_id", label_id)
        .execute()
        .data
    )
    child_ids = [r["child_id"] for r in child_rels]
    children = []
    if child_ids:
        children = (
            supabase.table("labels")
            .select("id, name")
            .in_("id", child_ids)
            .order("name")
            .execute()
            .data
        )

    link_count = (
        supabase.table("article_label")
        .select("article_id", count="exact")
        .eq("label_id", label_id)
        .execute()
    )

    label["parents"] = parents
    label["children"] = children
    label["article_count"] = link_count.count or 0
    return label