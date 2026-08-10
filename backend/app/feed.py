from fastapi import APIRouter, HTTPException, Query
from db import supabase

router = APIRouter(prefix="/feed", tags=["feed"])


@router.get("/")
def get_feed(
    agency_id: int | None = None,
    label_ids: list[int] | None = Query(default=None),
    country_ids: list[int] | None = Query(default=None),
    exclude_label_ids: list[int] | None = Query(default=None),
    date_from: str | None = None,
    date_to: str | None = None,
    only_undated: bool = False,
    page: int = 1,
    page_size: int = 20,
):
    try:
        result = supabase.rpc(
            "feed_articles",
            {
                "p_agency_id": agency_id,
                "p_label_ids": label_ids,
                "p_country_ids": country_ids,
                "p_exclude_label_ids": exclude_label_ids,
                "p_date_from": date_from,
                "p_date_to": date_to,
                "p_only_undated": only_undated,
                "p_page": page,
                "p_page_size": page_size,
            },
        ).execute()
        return result.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/agencies")
def get_agencies():
    result = supabase.table("agencies").select("*").order("name").execute()
    return result.data