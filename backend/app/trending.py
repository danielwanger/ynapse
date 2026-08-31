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

@router.get("/topics/by-week")
def trending_topics_by_week(weeks: int = Query(4, ge=1, le=12), limit_per_week: int = Query(10, ge=1, le=20)):
    result = supabase.rpc(
        "trending_topics_by_week",
        {"p_weeks": weeks, "p_limit_per_week": limit_per_week},
    ).execute()
    return result.data