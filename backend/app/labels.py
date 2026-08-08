from fastapi import APIRouter, HTTPException
from db import supabase

router = APIRouter(prefix="/labels", tags=["labels"])

# Die rekursive Query läuft als Postgres-Function, nicht als Python-Rekursion --
# effizienter und die Baumstruktur bleibt konsistent mit dem SQL-Schema.
# Diese Function muss einmalig in Supabase angelegt werden (siehe unten).
RECURSIVE_LABEL_TREE_FN = """
create or replace function label_tree(filter_class_id integer default null)
returns table (
    id bigint,
    name varchar,
    class_id integer,
    label_type varchar,
    parent_id bigint,
    depth integer,
    path bigint[]
)
language sql
stable
as $$
    with recursive tree as (
        select l.id, l.name, l.class_id, l.label_type,
               null::bigint as parent_id, 0 as depth, array[l.id] as path
        from labels l
        where not exists (select 1 from label_relationships lr where lr.child_id = l.id)
          and (filter_class_id is null or l.class_id = filter_class_id)

        union all

        select l.id, l.name, l.class_id, l.label_type,
               lr.parent_id, t.depth + 1, t.path || l.id
        from label_relationships lr
        join labels l on l.id = lr.child_id
        join tree t on t.id = lr.parent_id
        where not l.id = any(t.path)
    )
    select * from tree order by path;
$$;
"""


@router.get("/")
def get_labels(class_id: int | None = None):
    """
    Liefert die komplette Taxonomie als flache Liste mit depth/path,
    optional gefiltert nach class_id (7 = topic, 1 = country).
    Das Frontend baut daraus lokal den Baum auf (path/depth reichen dafür).
    """
    try:
        result = supabase.rpc(
            "label_tree", {"filter_class_id": class_id}
        ).execute()
        return result.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{label_id}")
def get_label(label_id: int):
    result = supabase.table("labels").select("*").eq("id", label_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Label nicht gefunden")
    return result.data[0]