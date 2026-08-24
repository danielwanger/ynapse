"""
Einmaliges/wiederholbares Seeding-Skript: kopiert die komplette bereinigte
Taxonomie (topic + country) und ALLE Artikel mit Embedding aus der privaten
Ynapse-DB in die Portfolio-DB.

- Artikel-Read paginiert explizit (.range()), weil Supabase/PostgREST
  Selects standardmäßig auf 1000 Zeilen pro Query begrenzt (API-Setting
  "Max Rows").
- Bereits vorhandene Artikel (gleiche URL) werden NICHT neu angelegt,
  aber ihre Label-Zuordnungen werden bei jedem Lauf aktualisiert (alte
  article_label-Einträge gelöscht, aktuelle aus der privaten DB
  nachgezogen) -- so übernimmt ein erneuter Lauf auch Label-Änderungen,
  die du in ContextHub nachträglich an bereits kopierten Artikeln machst.
- Labels (gleicher Name + label_type) werden übersprungen, keine
  Duplikate bei wiederholten Läufen.
- Parent-Beziehungen werden pro Kind mit dem aktuellen Stand aus der
  privaten DB abgeglichen (Set-Vergleich) und bei Abweichung komplett
  neu geschrieben -- so verschwinden veraltete Parent-Zuordnungen (z.B.
  nach einer Taxonomie-Umstrukturierung in ContextHub) auch im Portfolio.

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

        # Ziel-Stand der Beziehungen (aus privater DB) pro Kind sammeln,
        # um veraltete Parent-Zuordnungen zu erkennen (z.B. wenn ein Label
        # in ContextHub den Parent gewechselt hat).
        target_rels_by_child: dict[int, set[int]] = {}
        for row in tree:
            if row["parent_id"] is None:
                continue
            new_parent = id_map.get(row["parent_id"])
            new_child = id_map.get(row["id"])
            if new_parent is None or new_child is None:
                continue
            target_rels_by_child.setdefault(new_child, set()).add(new_parent)

        rels_updated = 0
        for new_child, target_parents in target_rels_by_child.items():
            existing_rel = (
                portfolio.table("label_relationships")
                .select("parent_id")
                .eq("child_id", new_child)
                .execute()
            )
            existing_parents = {row["parent_id"] for row in existing_rel.data}

            if existing_parents == target_parents:
                continue

            portfolio.table("label_relationships").delete().eq("child_id", new_child).execute()
            for parent_id in target_parents:
                portfolio.table("label_relationships").insert(
                    {"parent_id": parent_id, "child_id": new_child}
                ).execute()
            rels_updated += 1

        print(f"  {label_type}: {len(id_map)} Labels total nach Kopiervorgang")
        print(f"  {label_type}: {rels_updated} Labels mit geänderten Parent-Beziehungen aktualisiert")

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


def sync_labels_for_article(private_article_id: int, portfolio_article_id: int, id_map: dict[int, int]) -> bool:
    """Vergleicht die Label-Zuordnungen eines bereits vorhandenen Portfolio-
    Artikels mit dem aktuellen Stand aus der privaten DB. Nur bei
    Abweichung wird tatsächlich gelöscht + neu eingefügt (teure Operation),
    sonst passiert nichts. Gibt zurück, ob etwas geändert wurde."""
    private_labels = (
        private.table("article_label")
        .select("label_id")
        .eq("article_id", private_article_id)
        .execute()
        .data
    )
    # private label_ids -> portfolio label_ids umrechnen (Meta-Labels, die
    # nicht in id_map sind, fallen dabei automatisch raus)
    current_target_ids = {
        id_map[row["label_id"]] for row in private_labels if row["label_id"] in id_map
    }

    existing_links = (
        portfolio.table("article_label")
        .select("label_id")
        .eq("article_id", portfolio_article_id)
        .execute()
        .data
    )
    existing_ids = {row["label_id"] for row in existing_links}

    if current_target_ids == existing_ids:
        return False

    portfolio.table("article_label").delete().eq("article_id", portfolio_article_id).execute()
    for label_id in current_target_ids:
        portfolio.table("article_label").insert(
            {"article_id": portfolio_article_id, "label_id": label_id}
        ).execute()
    return True


def seed_articles(id_map: dict[int, int], dry_run: bool):
    """Kopiert ALLE Artikel mit vorhandenem Embedding und ihre
    Label-Zuordnungen. Bereits vorhandene Artikel werden nicht neu
    angelegt, aber ihre Label-Zuordnungen werden aktualisiert."""
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
    labels_checked = 0
    labels_changed = 0

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
            # Artikel existiert schon -- nicht neu anlegen, Labels nur bei
            # tatsächlicher Abweichung neu schreiben (Set-Vergleich statt
            # blindem delete+insert bei allen vorhandenen Artikeln).
            portfolio_article_id = existing_article.data[0]["id"]
            changed = sync_labels_for_article(article["id"], portfolio_article_id, id_map)
            labels_checked += 1
            if changed:
                labels_changed += 1
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

        # Label-Zuordnungen mitkopieren (nur die, deren Label auch in
        # id_map ist, also Teil der Taxonomie ist, die wir gerade kopiert
        # haben -- Meta-Labels werden dadurch automatisch uebersprungen)
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

    print(f"\n{copied} Artikel neu kopiert")
    print(f"{labels_checked} vorhandene Artikel geprüft, davon {labels_changed} mit geänderten Labels aktualisiert")


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