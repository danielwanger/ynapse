"""
Einmaliges Seeding-Skript: kopiert die komplette bereinigte Taxonomie
(topic + country) und eine kuratierte Auswahl echter Artikel aus der
privaten Ynapse-DB in die leere Portfolio-DB.

Kein automatischer Sync -- einmaliger, manueller Lauf. Danach kannst du
das Skript beliebig oft mit anderen Parametern (ARTICLE_LIMIT etc.)
erneut ausfuehren, um mehr Artikel nachzuziehen.

Ausfuehren:
    python seed_portfolio.py            # Vorschau (Dry-Run)
    python seed_portfolio.py --apply    # tatsaechlich schreiben
"""
import argparse
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

PRIVATE_URL = os.environ["PRIVATE_SUPABASE_URL"]
PRIVATE_KEY = os.environ["PRIVATE_SUPABASE_SERVICE_ROLE_KEY"]
PORTFOLIO_URL = os.environ["SUPABASE_URL"]
PORTFOLIO_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

private = create_client(PRIVATE_URL, PRIVATE_KEY)
portfolio = create_client(PORTFOLIO_URL, PORTFOLIO_KEY)

ARTICLE_LIMIT = 30  # Anzahl Artikel, die kuratiert uebernommen werden


def seed_labels(dry_run: bool):
    """Kopiert die komplette Taxonomie (topic + country), id-Remapping
    weil die Portfolio-DB eigene, neue ids vergibt."""
    id_map: dict[int, int] = {}  # private id -> portfolio id

    for label_type in ("topic", "country"):
        tree = private.rpc("label_tree", {"filter_label_type": label_type}).execute().data
        print(f"{label_type}: {len(tree)} Labels in privater DB gefunden")

        if dry_run:
            print(f"  [DRY RUN] wuerde {len(tree)} {label_type}-Labels + Beziehungen kopieren")
            continue

        # Erst alle Labels ohne Beziehungen anlegen (dedupliziert nach id)
        seen_ids = set()
        for row in tree:
            if row["id"] in seen_ids:
                continue
            seen_ids.add(row["id"])
            existing = (
                portfolio.table("labels")
                .select("id")
                .eq("name", row["name"])
                .eq("label_type", label_type)
                .execute()
            )
            if existing.data:
                id_map[row["id"]] = existing.data[0]["id"]
                continue
            created = (
                portfolio.table("labels")
                .insert({"name": row["name"], "label_type": label_type})
                .execute()
            )
            id_map[row["id"]] = created.data[0]["id"]

        # Danach Beziehungen mit den neuen ids nachziehen
        seen_rels = set()
        for row in tree:
            if row["parent_id"] is None:
                continue
            key = (row["parent_id"], row["id"])
            if key in seen_rels:
                continue
            seen_rels.add(key)
            new_parent = id_map.get(row["parent_id"])
            new_child = id_map.get(row["id"])
            if new_parent is None or new_child is None:
                continue
            existing_rel = (
                portfolio.table("label_relationships")
                .select("parent_id")
                .eq("parent_id", new_parent)
                .eq("child_id", new_child)
                .execute()
            )
            if not existing_rel.data:
                portfolio.table("label_relationships").insert(
                    {"parent_id": new_parent, "child_id": new_child}
                ).execute()

        print(f"  {label_type}: {len(id_map)} Labels total nach Kopiervorgang")

    return id_map


def seed_articles(id_map: dict[int, int], dry_run: bool):
    """Kopiert eine kuratierte Auswahl echter Artikel mit Embeddings und
    ihren Label-Zuordnungen."""
    articles = (
        private.table("articles")
        .select("id, title, url, meta_description, agency, published_at, embedding")
        .not_.is_("embedding", "null")
        .order("published_at", desc=True)
        .limit(ARTICLE_LIMIT)
        .execute()
        .data
    )
    print(f"\n{len(articles)} Artikel mit Embedding in privater DB gefunden (neueste zuerst)")

    if dry_run:
        for a in articles[:5]:
            print(f"  [DRY RUN] wuerde kopieren: {a['title']}")
        print(f"  [DRY RUN] ... und {max(0, len(articles) - 5)} weitere")
        return

    agency_cache: dict[str, int] = {}

    for article in articles:
        agency_name = article.get("agency") or "Unbekannt"
        if agency_name not in agency_cache:
            existing_agency = (
                portfolio.table("agencies").select("id").eq("name", agency_name).execute()
            )
            if existing_agency.data:
                agency_cache[agency_name] = existing_agency.data[0]["id"]
            else:
                created_agency = (
                    portfolio.table("agencies").insert({"name": agency_name}).execute()
                )
                agency_cache[agency_name] = created_agency.data[0]["id"]

        existing_article = (
            portfolio.table("articles").select("id").eq("url", article["url"]).execute()
        )
        if existing_article.data:
            print(f"  bereits vorhanden, uebersprungen: {article['title']}")
            continue

        created_article = (
            portfolio.table("articles")
            .insert(
                {
                    "title": article["title"],
                    "url": article["url"],
                    "meta_description": article.get("meta_description"),
                    "agency_id": agency_cache[agency_name],
                    "published_at": article.get("published_at"),
                    "embedding": article["embedding"],
                }
            )
            .execute()
        )
        new_article_id = created_article.data[0]["id"]

        # Label-Zuordnungen mitkopieren (nur die, deren Label auch in id_map ist,
        # also Teil der Taxonomie ist, die wir gerade kopiert haben)
        private_labels = (
            private.table("article_label")
            .select("label_id")
            .eq("article_id", article["id"])
            .execute()
            .data
        )
        for row in private_labels:
            new_label_id = id_map.get(row["label_id"])
            if new_label_id is None:
                continue
            portfolio.table("article_label").insert(
                {"article_id": new_article_id, "label_id": new_label_id}
            ).execute()

        print(f"  kopiert: {article['title']}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    dry_run = not args.apply

    if dry_run:
        print("=== DRY RUN -- es wird NICHTS geschrieben ===\n")
    else:
        print("=== ECHTER LAUF -- Aenderungen werden geschrieben ===\n")

    id_map = seed_labels(dry_run)
    seed_articles(id_map, dry_run)

    print("\nFertig." if not dry_run else "\nVorschau abgeschlossen.")


if __name__ == "__main__":
    main()