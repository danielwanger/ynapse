# Ynapse

Ein semantisches Nachrichten-Retrieval-System: Artikel werden nicht per Keyword,
sondern per Bedeutung durchsucht und in eine hierarchische Themen-Taxonomie
eingeordnet. Diese Version ist eine reduzierte, öffentliche Portfolio-Instanz --
das vollständige System (Scraping, Clustering, Classifier) läuft privat.

## Was hier läuft

- **Feed** mit Filtern nach Agentur, Thema, Land, Datum und Ausschluss-Filter
- **Semantische Suche** -- Artikel werden über Embedding-Ähnlichkeit gefunden,
  nicht nur über exakte Wortübereinstimmung
- **Label-Suche** über die Themen-/Länder-Taxonomie
- **Labelgraph** -- interaktive Visualisierung der Taxonomie als Force-Directed
  Graph, Knotengröße nach struktureller Zentralität (wie viele Pfade durch
  einen Knoten laufen)

### Architektur

```
Frontend (React/TS) --> Backend (FastAPI) --> Supabase (Postgres + pgvector)
                              |
                              v
                    private Ynapse-Instanz
                    (liefert Embeddings fuer
                     die semantische Suche)
```

Das Backend berechnet keine Embeddings selbst -- Suchanfragen werden an die
private Instanz weitergereicht, die das Modell ohnehin durchgehend geladen
hält. Das vermeidet ein zweites, redundantes Modell im Arbeitsspeicher.

## Wie die Daten entstehen (Roadmap: Pipeline-Code folgt)

Die Daten in diesem Repo sind eine kuratierte Teilmenge aus einem privaten
System, das täglich Nachrichtenartikel sammelt, verarbeitet und in eine
Taxonomie einordnet:

- **Embeddings:** `intfloat/multilingual-e5-large` (1024-dim), asymmetrische
  Suche (`query:`/`passage:`-Präfixe)
- **Clustering:** HDBSCAN auf UMAP-reduzierten Embeddings, ergänzt durch
  BERTopic-Keyword-Extraktion
- **NER:** spaCy (`xx_ent_wiki_sm`) für Länder-/Entitäts-Erkennung
- **Taxonomie:** ein DAG (nicht nur Baum) aus Themen- und Länder-Labels,
  gepflegt über ein bidirektional synchronisiertes Obsidian-Vault
- **Classifier (in Arbeit):** xlm-roberta, überwacht trainiert auf manuell
  gelabelten Artikeln, für automatische Label-Zuweisung

Der eigentliche Pipeline-Code (Scraping, Embedding-Berechnung, Clustering)
ist noch nicht Teil dieses Repos -- das ist der nächste geplante Ausbauschritt,
sobald die private Pipeline selbst weiter stabilisiert ist. Bis dahin dient
dieses Repo als Beleg für das Retrieval-System, das auf diesen Daten aufbaut.

## Tech-Stack

- **Frontend:** React, TypeScript, Vite, D3.js
- **Backend:** FastAPI, Python
- **Datenbank:** Supabase (PostgreSQL + pgvector)
- **Deployment:** Netlify (Frontend), Coolify/Hetzner (Backend)