from fastapi import APIRouter, Query
from db import supabase

router = APIRouter(prefix="/trending", tags=["trending"])


@router.get("/topics")
def trending_topics(days: int = Query(7, ge=1, le=90), limit: int = Query(10, ge=1, le=50)):
    """
    Themen mit den meisten neuen Artikeln im gewaehlten Zeitraum
    (Score = reiner Artikel-Count, absteigend sortiert). Nutzt die
    SQL-Funktion trending_topics() in der Portfolio-DB.
    """
    result = supabase.rpc(
        "trending_topics",
        {"p_days": days, "p_limit": limit},
    ).execute()
    return result.data