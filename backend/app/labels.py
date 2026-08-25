from fastapi import APIRouter, HTTPException
from httpx import RemoteProtocolError
from db import supabase
from retry_utils import with_retry

router = APIRouter(prefix="/labels", tags=["labels"])

# Die rekursive Query läuft als Postgres-Function, nicht als Python-Rekursion --
# effizienter und die Baumstruktur bleibt konsistent mit dem SQL-Schema.
# Diese Function muss einmalig in Supabase angelegt werden (siehe Migration).
#
# NEU: article_count zählt die direkt diesem Label zugeordneten Artikel
# (article_label.label_id = l.id), NICHT rekursiv über Kind-Labels aufsummiert.
# Falls in article_label sowohl 'manual' als auch 'centroid_restore' Zeilen
# stehen und beide als Zuordnung zählen sollen, bleibt der COUNT wie unten.
# Falls nur 'manual' zählen soll, muss ein "and al.source = 'manual'" rein.
RECURSIVE_LABEL_TREE_FN = """
create or replace function label_tree(filter_label_type varchar default null)
returns table (
    id bigint,
    name varchar,
    label_type varchar,
    parent_id bigint,
    depth integer,
    path bigint[],
    article_count bigint
)
language sql
stable
as $$
    with recursive tree as (
        select l.id, l.name, l.label_type,
               null::bigint as parent_id, 0 as depth, array[l.id] as path
        from labels l
        where not exists (select 1 from label_relationships lr where lr.child_id = l.id)
          and (filter_label_type is null or l.label_type = filter_label_type)

        union all

        select l.id, l.name, l.label_type,
               lr.parent_id, t.depth + 1, t.path || l.id
        from label_relationships lr
        join labels l on l.id = lr.child_id
        join tree t on t.id = lr.parent_id
        where not l.id = any(t.path)
    ),
    article_counts as (
        select al.label_id, count(*) as article_count
        from article_label al
        group by al.label_id
    )
    select t.id, t.name, t.label_type, t.parent_id, t.depth, t.path,
           coalesce(ac.article_count, 0) as article_count
    from tree t
    left join article_counts ac on ac.label_id = t.id
    order by t.path;
$$;
"""


@router.get("/")
@with_retry()
def get_labels(label_type: str | None = None):
    """
    Liefert die komplette Taxonomie als flache Liste mit depth/path/article_count,
    optional gefiltert nach label_type ('topic' oder 'country').
    Das Frontend baut daraus lokal den Baum auf (path/depth reichen dafür).
    """
    try:
        result = supabase.rpc(
            "label_tree", {"filter_label_type": label_type}
        ).execute()
        return result.data
    except RemoteProtocolError:
        # nicht hier abfangen -- soll bis zum @with_retry-Decorator
        # durchgereicht werden, damit ein Retry stattfinden kann
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{label_id}")
@with_retry()
def get_label(label_id: int):
    result = supabase.table("labels").select("*").eq("id", label_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Label nicht gefunden")
    return result.data[0]