"""
Einmaliges/wiederholbares Seeding-Skript: kopiert die komplette bereinigte
Taxonomie (topic + country) und ALLE gelabelten Artikel mit Embedding aus
der privaten Ynapse-DB in die Portfolio-DB.

- Artikel-Read paginiert explizit (.range()), weil Supabase/PostgREST
  Selects standardmäßig auf 1000 Zeilen pro Query begrenzt (API-Setting
  "Max Rows").
- [FIX] label_tree()-RPC-Aufruf ebenfalls paginiert (.range()) -- der
  RPC-Call unterliegt demselben PostgREST-Default-Limit wie normale
  Table-Selects. Da label_tree() bei DAG-Strukturen (Labels mit mehreren
  Eltern) pro Elternpfad eine eigene Zeile liefert, kann die echte
  Zeilenzahl deutlich über 1000 liegen, obwohl die Anzahl distinkter
  Labels kleiner ist. Ohne Paginierung wurden Teile des Baums (z.B. ein
  Root-Label wie "Media" oder dessen Kind-Kanten) beim Cutoff
  abgeschnitten und tauchten weder in id_map noch in
  label_relationships auf -- sichtbar als "Label X fehlt als Superparent"
  im Frontend, obwohl es in der privaten DB existiert.
- Nur Artikel mit mindestens einem Label (article_label-Eintrag) werden
  kopiert -- ungelabelte Artikel landen NICHT im Portfolio.
- meta_description wird bewusst NICHT mitkopiert (Presse-Snippet-Risiko,
  §87f-h UrhG / Art. 15 DSM-RL) -- weder gelesen noch geschrieben.
- Bereits vorhandene Artikel (gleiche URL) werden NICHT neu angelegt,
  aber ihr Embedding wird bei jedem Lauf mit dem aktuellen Stand aus der
  privaten DB abgeglichen [FIX], und ihre Label-Zuordnungen werden bei
  jedem Lauf aktualisiert (alte article_label-Einträge gelöscht, aktuelle
  aus der privaten DB nachgezogen) -- so übernimmt ein erneuter Lauf auch
  Label-Änderungen und Embedding-Bereinigungen, die du in ContextHub
  nachträglich an bereits kopierten Artikeln machst.
- Labels (gleicher Name + label_type) werden übersprungen, keine
  Duplikate bei wiederholten Läufen.
- Parent-Beziehungen werden pro Kind mit dem aktuellen Stand aus der
  privaten DB abgeglichen (Set-Vergleich) und bei Abweichung komplett
  neu geschrieben -- so verschwinden veraltete Parent-Zuordnungen (z.B.
  nach einer Taxonomie-Umstrukturierung in ContextHub) auch im Portfolio.
- Artikel, die in der privaten DB ALLE Labels verloren haben (z.B. weil
  ihr einziges Label geloescht/entkoppelt wurde), werden separat
  behandelt: sie fallen aus der normalen "gelabelte Artikel"-Iteration
  raus (fetch_labeled_article_ids() enthaelt sie nicht mehr), wuerden
  ohne diesen Zusatzschritt aber ihre alten, jetzt veralteten
  Portfolio-Label-Verknuepfungen unveraendert behalten. Der Schritt
  clear_labels_for_delisted_articles() raeumt genau diesen Fall auf,
  indem er fuer bereits im Portfolio vorhandene Artikel, die NICHT mehr
  in labeled_ids sind, deren article_label-Eintraege im Portfolio leert.
- [FIX] Bereits vorhandene Artikel bekamen bisher NIE ein aktualisiertes
  Embedding -- nur Labels wurden synchronisiert, der Insert-Block mit
  `embedding` wurde per `continue` uebersprungen. Dadurch blieben in
  ContextHub bereinigte (z.B. auf NULL gesetzte) Embeddings in der
  Portfolio-DB dauerhaft auf dem alten, ggf. verseuchten Stand. Jetzt
  wird embedding bei jedem Lauf mit der privaten DB abgeglichen und bei
  Abweichung ueberschrieben.

BEKANNTE EINSCHRAENKUNG (noch nicht gefixt, siehe Chat):
  Ein Artikel, der noch NICHT im Portfolio existiert UND in der privaten
  DB (noch) kein Embedding hat, wird in seed_articles() per `continue`
  uebersprungen -- weder als "existing" geprueft noch neu angelegt. Er
  bleibt bei jedem Lauf unsichtbar, bis er in der privaten DB ein
  Embedding bekommt (z.B. durch einen separaten Embedding-Job) und das
  Skript danach erneut laeuft. Zwei moegliche Loesungen:
    1. Embedding direkt hier im Seed-Skript berechnen und in private +
       Portfolio-DB schreiben, wenn es fehlt.
    2. Sicherstellen, dass ein separater Job neue Artikel zeitnah nach
       dem Scraping embedded, bevor seed_portfolio_full.py laeuft.
  Noch nicht entschieden -- aktuelles Skip-Verhalten unveraendert
  gelassen.

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


def fetch_label_tree(label_type: str) -> list[dict]:
    """[FIX] Holt den kompletten label_tree()-RPC-Output paginiert.
    Ohne .range() schneidet PostgREST bei 1000 Zeilen ab (Default "Max
    Rows"). Da label_tree() bei mehreren Eltern (DAG) pro Elternpfad
    eine eigene Zeile liefert, kann die echte Zeilenzahl weit über der
    Anzahl distinkter Labels liegen -- betraf zuletzt z.B. ein Root-Label
    wie "Media", dessen Zeile(n) durch den Cutoff verschluckt wurden und
    dadurch im Portfolio als Superparent fehlten."""
    PAGE_SIZE = 1000
    rows: list[dict] = []
    offset = 0
    while True:
        batch = (
            private.rpc("label_tree", {"filter_label_type": label_type})
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
            .data
        )
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def seed_labels(dry_run: bool) -> dict[int, int]:
    """Kopiert die komplette Taxonomie (topic + country), id-Remapping
    weil die Portfolio-DB eigene, neue ids vergibt."""
    id_map: dict[int, int] = {}  # private id -> portfolio id

    for label_type in ("topic", "country"):
        tree = fetch_label_tree(label_type)  # [FIX] paginiert statt einzelner .execute()
        print(f"{label_type}: {len(tree)} Zeilen aus label_tree() geladen (paginiert)")

        if dry_run:
            distinct_ids = {row["id"] for row in tree}
            print(f"  [DRY RUN] wuerde {len(distinct_ids)} distinkte {label_type}-Labels + Beziehungen kopieren")
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
    """Holt ALLE Artikel aus der privaten DB, paginiert in 1000er-Bloecken
    (PostgREST-Default-Limit umgehen). meta_description wird bewusst NICHT
    selektiert (Presse-Snippet-Risiko, soll nie in die Portfolio-DB
    gelangen).

    [FIX] Der frühere .not_.is_("embedding", "null")-Filter schloss
    Artikel mit NULL-Embedding schon beim Fetch aus. Das verhinderte, dass
    ein nachträglich in ContextHub auf NULL gesetztes Embedding (z.B. nach
    Bereinigung von Paywall-Boilerplate-Content) jemals beim Abgleich in
    seed_articles() ankam -- der Artikel tauchte in der Liste schlicht
    nicht mehr auf. Neu-Anlage von Artikeln ganz ohne Embedding wird
    stattdessen weiter unten in seed_articles() selbst verhindert (dort,
    wo ohnehin gefiltert wird), damit dieser Fall kontrolliert bleibt."""
    PAGE_SIZE = 1000
    articles = []
    offset = 0
    while True:
        batch = (
            private.table("articles")
            .select("id, title, url, agency, published_at, embedding")
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


def fetch_labeled_article_ids() -> set[int]:
    """Holt alle article_ids aus der privaten DB, die mindestens ein
    Label haben (paginiert). Nur diese Artikel werden ins Portfolio
    kopiert -- ungelabelte Artikel bleiben privat."""
    PAGE_SIZE = 1000
    labeled_ids: set[int] = set()
    offset = 0
    while True:
        batch = (
            private.table("article_label")
            .select("article_id")
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
            .data
        )
        labeled_ids.update(row["article_id"] for row in batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return labeled_ids


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


def fetch_portfolio_url_to_id_map() -> dict[str, int]:
    """Holt alle (url -> id) Paare aus der Portfolio-DB, paginiert.
    Wird gebraucht, um Portfolio-Artikel zu finden, die im aktuellen
    Lauf NICHT ueber labeled_ids erreicht werden (weil sie privat alle
    Labels verloren haben), aber im Portfolio noch existieren."""
    PAGE_SIZE = 1000
    url_to_id: dict[str, int] = {}
    offset = 0
    while True:
        batch = (
            portfolio.table("articles")
            .select("id, url")
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
            .data
        )
        for row in batch:
            url_to_id[row["url"]] = row["id"]
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return url_to_id


def clear_labels_for_delisted_articles(
    all_private_articles: list[dict],
    labeled_ids: set[int],
    dry_run: bool,
) -> int:
    """Kernfix: Artikel, die in der privaten DB frueher gelabelt waren,
    jetzt aber KEIN Label mehr haben (z.B. weil ihr einziges Label
    geloescht/entkoppelt wurde), fallen aus der normalen
    "gelabelte Artikel"-Iteration in seed_articles() komplett raus --
    dort wird nur ueber Artikel iteriert, die AKTUELL in labeled_ids
    sind. Ohne diesen Zusatzschritt behalten sie im Portfolio also ihre
    alten, jetzt veralteten Label-Verknuepfungen fuer immer, unabhaengig
    davon wie oft das Skript erneut laeuft.

    Hier werden deshalb explizit alle privaten Artikel OHNE Embedding-
    Filter durchsucht (auch Artikel ohne embedding koennen betroffen
    sein, falls sie frueher schon einmal geseedet wurden), auf
    "aktuell privat ungelabelt" geprueft, und falls sie im Portfolio
    per URL gefunden werden, dort leergeraeumt."""
    now_unlabeled = [a for a in all_private_articles if a["id"] not in labeled_ids]
    if not now_unlabeled:
        print("\nKeine Artikel privat komplett entlabelt -- nichts aufzuräumen.")
        return 0

    print(f"\n{len(now_unlabeled)} Artikel sind in der privaten DB jetzt komplett ohne Label.")

    # Auch im Dry-Run schon die echten Portfolio-Treffer zaehlen (nur
    # lesend: url_to_portfolio_id + article_label-select), damit die
    # Vorschau nicht nur die rohe, oft viel zu hohe private Zahl zeigt,
    # sondern die tatsaechlich betroffene Teilmenge im Portfolio.
    url_to_portfolio_id = fetch_portfolio_url_to_id_map()
    would_affect = 0
    for article in now_unlabeled:
        portfolio_id = url_to_portfolio_id.get(article["url"])
        if portfolio_id is None:
            continue
        existing_links = (
            portfolio.table("article_label")
            .select("label_id")
            .eq("article_id", portfolio_id)
            .execute()
            .data
        )
        if existing_links:
            would_affect += 1

    if dry_run:
        print(f"  Davon existieren {would_affect} im Portfolio noch mit alten Label-Verknuepfungen.")
        print("  [DRY RUN] wuerde diese leeren.")
        return 0

    cleared = 0
    for article in now_unlabeled:
        portfolio_id = url_to_portfolio_id.get(article["url"])
        if portfolio_id is None:
            continue  # nie geseedet, nichts zu tun

        existing_links = (
            portfolio.table("article_label")
            .select("label_id")
            .eq("article_id", portfolio_id)
            .execute()
            .data
        )
        if not existing_links:
            continue  # im Portfolio ohnehin schon leer

        portfolio.table("article_label").delete().eq("article_id", portfolio_id).execute()
        cleared += 1

    print(f"  {cleared} Portfolio-Artikel hatten noch veraltete Label-Verknuepfungen und wurden geleert.")
    return cleared


def seed_articles(id_map: dict[int, int], dry_run: bool):
    """Kopiert alle gelabelten Artikel mit vorhandenem Embedding und ihre
    Label-Zuordnungen. Bereits vorhandene Artikel werden nicht neu
    angelegt, aber ihr Embedding [FIX] und ihre Label-Zuordnungen werden
    aktualisiert.

    HINWEIS: Ein Artikel ohne Embedding, der noch nicht im Portfolio
    existiert, wird uebersprungen (siehe Modul-Docstring, "BEKANNTE
    EINSCHRAENKUNG")."""
    print("\nLade Artikel aus privater DB (paginiert)...")
    articles = fetch_all_articles_with_embedding()

    print("Lade gelabelte Artikel-IDs...")
    labeled_ids = fetch_labeled_article_ids()

    # Bevor gefiltert wird, zuerst die Aufraeum-Prüfung für Artikel
    # anstoßen, die privat komplett entlabelt wurden -- muss auf der
    # UNGEFILTERTEN Liste passieren, da sonst genau die Artikel, die wir
    # aufräumen wollen, schon vorher rausfallen wuerden.
    clear_labels_for_delisted_articles(articles, labeled_ids, dry_run)

    # Nicht-öffentliche Einträge raus -- alles, was über manual:// angelegt
    # wurde (z. B. eigene Notizen statt echter News-Artikel), soll nicht
    # auf der öffentlichen Portfolio-Seite landen. Ausserdem: example.com-
    # Platzhalter (Test-/Debug-Artikel), Artikel ohne Titel (Scraper hat
    # nichts gefunden, sehen als Feed-Karte kaputt aus), und Artikel ganz
    # ohne Label (sollen privat bleiben).
    before_filter = len(articles)
    articles = [
        a for a in articles
        if not a["url"].startswith("manual://")
        and "example.com" not in a["url"]
        and a.get("title")
        and a["id"] in labeled_ids
    ]
    filtered_out = before_filter - len(articles)

    print(f"\n{before_filter} Artikel mit Embedding in privater DB gefunden")
    print(f"{filtered_out} davon gefiltert (manual:// / example.com / ohne Titel / ungelabelt), {len(articles)} bleiben übrig")

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
    embeddings_updated = 0  # [FIX] Zähler für Transparenz im Log
    titles_updated = 0  # [FIX] Zähler für Transparenz im Log
    skipped_no_embedding = 0  # Zähler für Transparenz: neue Artikel ohne Embedding

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

        # [FIX] embedding mitselektieren, um es unten mit dem privaten
        # Stand vergleichen zu können.
        existing_article = (
            portfolio.table("articles").select("id, embedding, title").eq("url", article["url"]).execute()
        )
        if not existing_article.data and article.get("embedding") is None:
            # Neu-Anlage ohne Embedding verhindern (siehe "BEKANNTE
            # EINSCHRAENKUNG" im Modul-Docstring).
            skipped_no_embedding += 1
            continue
        if existing_article.data:
            # Artikel existiert schon -- nicht neu anlegen.
            portfolio_article_id = existing_article.data[0]["id"]

            # [FIX] Embedding immer mit dem aktuellen Stand aus der
            # privaten DB abgleichen. Schließt die Lücke, durch die
            # bereinigte (z.B. auf NULL gesetzte) Embeddings in ContextHub
            # nie ins Portfolio durchgereicht wurden.
            existing_embedding = existing_article.data[0].get("embedding")
            new_embedding = article["embedding"]
            if existing_embedding != new_embedding:
                portfolio.table("articles").update(
                    {"embedding": new_embedding}
                ).eq("id", portfolio_article_id).execute()
                embeddings_updated += 1

            # [FIX] Titel ebenfalls abgleichen -- deckt Fälle ab, in denen
            # ein ursprünglich fehlerhaft extrahierter Titel (Scraper-Fehler,
            # Blockseite, Agenturname statt echtem Titel) in ContextHub
            # nachträglich manuell korrigiert wurde. Ohne diesen Abgleich
            # bliebe die Portfolio-DB dauerhaft auf dem alten, falschen Titel
            # stehen, da der bestehende-Artikel-Zweig sonst nur embedding
            # und Labels anfasst.
            existing_title = existing_article.data[0].get("title")
            new_title = article["title"]
            if existing_title != new_title:
                portfolio.table("articles").update(
                    {"title": new_title}
                ).eq("id", portfolio_article_id).execute()
                titles_updated += 1

            # Labels nur bei tatsächlicher Abweichung neu schreiben
            # (Set-Vergleich statt blindem delete+insert bei allen
            # vorhandenen Artikeln).
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
    if skipped_no_embedding:
        print(f"{skipped_no_embedding} neue Artikel uebersprungen, weil noch kein Embedding vorhanden ist (siehe 'BEKANNTE EINSCHRAENKUNG')")
    print(f"{embeddings_updated} bestehende Artikel mit geänderten Embeddings aktualisiert")
    print(f"{titles_updated} bestehende Artikel mit geändertem Titel aktualisiert")
    print(f"{labels_checked} vorhandene Artikel geprüft, davon {labels_changed} mit geänderten Labels aktualisiert")


def seed_label_resources(id_map: dict[int, int], dry_run: bool):
    """Kopiert label_resources aus der privaten DB, mit id-Remapping
    ueber dasselbe id_map wie Labels/Artikel. Volles Replace pro Lauf
    (kleine, rein manuell kuratierte Tabelle, kein Risiko wie bei
    Artikeln/Taxonomie).

    Hinweis: id_map ist im Dry-Run leer, weil seed_labels() im Dry-Run
    frueh abbricht (vor dem eigentlichen Aufbau von id_map). Die
    Dry-Run-Vorschau dieser Funktion zeigt deshalb faelschlich "alles
    uebersprungen" -- kein Bug hier, sondern bestehendes Verhalten des
    Scripts, das sich auf diesen Schritt uebertraegt."""
    print("\nLade label_resources aus privater DB...")
    resources = (
        private.table("label_resources")
        .select("label_id, url, title, description, resource_type, sort_order")
        .execute()
        .data
    )
    print(f"{len(resources)} label_resources in privater DB gefunden")

    # nur Ressourcen, deren Label auch tatsaechlich Teil der kopierten
    # Taxonomie ist (id_map) -- sonst wuerde eine FK-Verletzung drohen
    mapped = []
    skipped = 0
    for r in resources:
        portfolio_label_id = id_map.get(r["label_id"])
        if portfolio_label_id is None:
            skipped += 1
            continue
        mapped.append({**r, "label_id": portfolio_label_id})

    print(f"{len(mapped)} davon mit Label in aktueller Portfolio-Taxonomie, {skipped} uebersprungen (Label nicht im Portfolio)")

    if dry_run:
        print("  [DRY RUN] wuerde label_resources in Portfolio-DB komplett ersetzen")
        return

    portfolio.table("label_resources").delete().neq("id", 0).execute()
    for r in mapped:
        portfolio.table("label_resources").insert({
            "label_id": r["label_id"],
            "url": r["url"],
            "title": r["title"],
            "description": r.get("description"),
            "resource_type": r["resource_type"],
            "sort_order": r.get("sort_order", 0),
        }).execute()

    print(f"  {len(mapped)} label_resources in Portfolio-DB geschrieben")


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
    seed_label_resources(id_map, dry_run)

    print("\nFertig." if not dry_run else "\nVorschau abgeschlossen.")


if __name__ == "__main__":
    main()