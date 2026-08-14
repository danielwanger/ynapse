"""
Einmaliges Seeding-Skript: kopiert die komplette bereinigte Taxonomie
(topic + country) und ALLE Artikel mit Embedding aus der privaten
Ynapse-DB in die Portfolio-DB.

Unterschied zur ersten Version (seed_portfolio.py): kein ARTICLE_LIMIT
mehr -- holt wirklich alle Artikel mit vorhandenem Embedding, nicht nur
eine kuratierte Auswahl von 30.

Wichtig: Der Artikel-Read paginiert jetzt explizit (.range()), weil
Supabase/PostgREST Selects standardmäßig auf 1000 Zeilen pro Query
begrenzt (API-Setting "Max Rows") -- ohne Pagination wurden bei mehr
als 1000 privaten Artikeln stillschweigend nur die ersten 1000 kopiert.

Bereits vorhandene Artikel (gleiche URL) und Labels (gleicher Name +
label_type) werden übersprungen, das Skript ist also wiederholt
ausführbar, ohne Duplikate zu erzeugen.

Ausführen aus backend/app/:
    python seed_portfolio_full.py            # Vorschau (Dry-Run)
    python seed_portfolio_full.py --apply    # tatsächlich schreiben
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


def seed_labels(dry_run: bool) -> dict[int, int]:
    """Kopiert die komplette Taxonomie (topic + country), id-Remapping
    weil die Portfolio-DB eigene, neue ids vergibt."""
    id_map: dict[int, int] = {}  # private id -> portfolio id

    for label_type in ("topic", "country"):
        tree = private.rpc("label_tree", {"filter_label_type": label_type}).execute().data
        print(f"{label_type}: {len(tree)} Labels in privater DB gefunden")

        if dry_run:
            print(f"  [DRY RUN] wuerde {len(tree)} {label_type}-Labels + Beziehungen kopieren")
            continue

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


def fetch_all_articles_with_embedding():
    """Holt ALLE Artikel mit Embedding aus der privaten DB, paginiert in
    1000er-Bloecken (PostgREST-Default-Limit umgehen)."""
    PAGE_SIZE = 1000
    articles = []
    offset = 0
    while True:
        batch = (
            private.table("articles")
            .select("id, title, url, meta_description, agency, published_at, embedding")
            .not_.is_("embedding", "null")
            .order("id")
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
            .data
        )
        articles.extend(batch)
        print(f"  ...{len(articles)} bisher geladen")
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return articles


def seed_articles(id_map: dict[int, int], dry_run: bool):
    """Kopiert ALLE Artikel mit vorhandenem Embedding und ihre
    Label-Zuordnungen -- keine Obergrenze mehr."""
    print("\nLade Artikel aus privater DB (paginiert)...")
    articles = fetch_all_articles_with_embedding()

    # Nicht-öffentliche Einträge raus -- alles, was über manual:// angelegt
    # wurde (z. B. eigene Notizen statt echter News-Artikel), soll nicht
    # auf der öffentlichen Portfolio-Seite landen. Ausserdem: example.com-
    # Platzhalter (Test-/Debug-Artikel) und Artikel ohne Titel (Scraper hat
    # nichts gefunden, sehen als Feed-Karte kaputt aus).
    before_filter = len(articles)
    articles = [
        a for a in articles
        if not a["url"].startswith("manual://")
        and "example.com" not in a["url"]
        and a.get("title")
    ]
    filtered_out = before_filter - len(articles)

    print(f"\n{before_filter} Artikel mit Embedding in privater DB gefunden")
    print(f"{filtered_out} davon gefiltert (manual:// / example.com / ohne Titel), {len(articles)} bleiben übrig")

    if dry_run:
        preview_path = "seed_preview.txt"
        with open(preview_path, "w", encoding="utf-8") as f:
            for a in articles:
                f.write(f"{a['title']}  |  {a['url']}\n")
        print(f"\n  [DRY RUN] vollständige Liste geschrieben nach: {preview_path}")
        print(f"  [DRY RUN] ({len(articles)} Zeilen)")
        return

    agency_cache: dict[str, int] = {}
    copied = 0
    skipped = 0

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
            skipped += 1
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

        copied += 1
        if copied % 100 == 0:
            print(f"  {copied} kopiert...")

    print(f"\n{copied} Artikel neu kopiert, {skipped} bereits vorhanden (uebersprungen)")


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