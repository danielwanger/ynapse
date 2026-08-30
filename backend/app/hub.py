from fastapi import APIRouter, HTTPException
from db import supabase
from retry_utils import with_retry

router = APIRouter(tags=["hub"])


@router.get("/labels/{label_id}/hub")
@with_retry()
def get_label_hub(label_id: int):
    label_res = (
        supabase.table("labels")
        .select("id, name, label_type, is_sensitive")
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
            .eq("is_sensitive", False)  # sensible Eltern-Labels nicht in Breadcrumb zeigen
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
            .eq("is_sensitive", False)  # sensible Unterthemen nicht auflisten
            .order("name")
            .execute()
            .data
        )

    # Artikel-Zaehlung: nur datierte Artikel zaehlen, die NICHT ueber ein
    # sensibles Label verknuepft sind -- muss mit dem Filter in
    # feed_articles()/match_articles()/trending_topics() konsistent sein,
    # sonst zeigt der Zaehler oben eine andere Zahl als die Artikelliste
    # unten (die ueber /feed/ laeuft).
    count_res = supabase.rpc(
        "count_visible_articles_for_label", {"p_label_id": label_id}
    ).execute()
    label["parents"] = parents
    label["children"] = children
    label["article_count"] = count_res.data if isinstance(count_res.data, int) else 0
    return label