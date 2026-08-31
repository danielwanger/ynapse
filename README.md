# Ynapse

Semantische Suche und thematische Einordnung für Nachrichtenartikel: Artikel werden nicht per Keyword, sondern per Embedding-Ähnlichkeit durchsucht und automatisch in eine hierarchische Themen-Taxonomie eingeordnet.

Diese Version ist eine reduzierte, öffentliche Portfolio-Instanz - das vollständige System (Scraping, Classifier-Training) läuft privat und verarbeitet täglich neue Artikel.

## Was hier läuft

- **Semantische Suche** - Artikel werden über Embedding-Ähnlichkeit (Cosine Similarity) gefunden, nicht nur über exakte Wortübereinstimmung
- **Wochenschau** - die aktivsten Themen der letzten Wochen nach Artikel-Anzahl, aufgeteilt nach Kalenderwoche, mit Artikel-Vorschau pro Thema
- **Label-Suche** über die Themen-/Länder-Taxonomie
- **Labelgraph** - interaktive Visualisierung der Taxonomie als Force-Directed Graph (D3.js), Knotengröße nach struktureller Zentralität
- **Feed** mit Filtern nach Agentur, Thema, Land, Datum und Ausschluss-Filter

## Architektur

```
Frontend (React/TS) --> Backend (FastAPI) --> Supabase (Postgres + pgvector)
                              |
                              v
                    private Ynapse-Instanz
                    (liefert Embeddings fuer
                     die semantische Suche)
```

Das Backend berechnet keine Embeddings selbst - Suchanfragen werden an die private Instanz weitergereicht, die das Modell ohnehin durchgehend geladen hält. Das vermeidet ein zweites, redundantes Modell im Arbeitsspeicher.

## Embedding- und Retrieval-Stack

- **Modell:** `intfloat/multilingual-e5-large` (1024-dim), asymmetrische Suche mit `query:`/`passage:`-Präfixen
- **Vektor-Suche:** pgvector (Postgres-Extension), Cosine Distance
- **Taxonomie:** ein DAG (nicht nur Baum) aus Themen- und Länder-Labels
- **Classifier (in Arbeit):** xlm-roberta, trainiert auf manuell gelabelten Artikeln, ONNX-quantisiert für Inferenz

## Kuratierung

Die öffentliche Instanz filtert bewusst tagespolitisch kontroverse und stark parteibezogene Themen aus dem Feed, der Suche und der Taxonomie-Ansicht - über ein Sensitivitäts-Flag auf Label-Ebene, das direkt in den SQL-Funktionen (`feed_articles`, `match_articles`, `trending_topics`) greift. Ziel ist eine neutrale, technisch fokussierte Demo-Instanz statt eines vollständigen News-Aggregators.

## Tech-Stack

- **Frontend:** React, TypeScript, Vite, D3.js
- **Backend:** FastAPI, Python
- **Datenbank:** Supabase (PostgreSQL + pgvector)
- **Deployment:** Netlify (Frontend), Coolify/Hetzner (Backend)

## Roadmap

Der eigentliche Pipeline-Code (Scraping, Embedding-Berechnung) ist noch nicht Teil dieses Repos - das ist der nächste geplante Ausbauschritt, sobald die private Pipeline weiter stabilisiert ist. Bis dahin dient dieses Repo als Beleg für das Retrieval-System, das auf diesen Daten aufbaut.
