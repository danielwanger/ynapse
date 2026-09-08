from fastapi import APIRouter, HTTPException
from httpx import RemoteProtocolError
from db import supabase
from retry_utils import with_retry

router = APIRouter(prefix="/labels", tags=["label_resources"])


@router.get("/{label_id}/resources")
@with_retry()
def get_label_resources(label_id: int):
    """
    Liefert die kuratierten Links (Wikipedia, Organisationen,
    Tools/Dashboards) fuer ein Label, sortiert nach sort_order.
    Rein lesend -- Pflege passiert ausschliesslich in der privaten
    ContextHub-DB und wird per seed_label_resources() synchronisiert.
    """
    try:
        result = (
            supabase.table("label_resources")
            .select("url, title, description, resource_type")
            .eq("label_id", label_id)
            .order("sort_order")
            .execute()
        )
        return result.data
    except RemoteProtocolError:
        # nicht hier abfangen -- soll bis zum @with_retry-Decorator
        # durchgereicht werden, damit ein Retry stattfinden kann
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))