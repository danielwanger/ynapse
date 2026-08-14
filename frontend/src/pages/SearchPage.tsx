import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api";
import "./searchpage.css";

interface Label {
  id: number;
  name: string;
  label_type: string;
}

interface SemanticResult {
  id: number;
  title: string | null;
  url: string;
  agency_id: number | null;
  similarity: number;
}

export default function SearchPage() {
  const navigate = useNavigate();

  const [query, setQuery] = useState("");

  const [labelMatches, setLabelMatches] = useState<Label[]>([]);
  const [labelLoading, setLabelLoading] = useState(false);

  const [semanticResults, setSemanticResults] = useState<SemanticResult[]>([]);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticSearched, setSemanticSearched] = useState(false);

  // Label-Textsuche: guenstige lokale DB-Abfrage, laeuft live mit
  // Debounce mit, ohne dass man extra bestaetigen muss.
  useEffect(() => {
    if (!query.trim()) {
      setLabelMatches([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setLabelLoading(true);
      try {
        const { data } = await api.get<Label[]>("/labels/search", {
          params: { q: query.trim() },
        });
        setLabelMatches(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLabelLoading(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  // Semantische Suche: laeuft ueber die private Instanz (Embedding-Berechnung,
  // ggf. Cold-Start-Verzoegerung) -- daher bewusst nicht bei jedem
  // Tastendruck, sondern erst auf Enter/Klick.
  const runSemanticSearch = async () => {
    if (!query.trim()) return;
    setSemanticLoading(true);
    setSemanticSearched(true);
    try {
      const { data } = await api.get<SemanticResult[]>("/embeddings/search", {
        params: { q: query.trim(), limit: 10 },
      });
      setSemanticResults(data);
    } catch (err) {
      console.error(err);
      setSemanticResults([]);
    } finally {
      setSemanticLoading(false);
    }
  };

  const goToLabel = (l: Label) => {
    navigate(`/feed?${l.label_type}=${l.id}`);
  };

  const hasAnyResults = labelMatches.length > 0 || semanticResults.length > 0;

  return (
    <div className="search-hero">
      <h1 className="search-title">Ynapse durchsuchen</h1>
      <p className="search-subtitle">
        Themen, Länder oder Artikel finden — Label-Treffer erscheinen sofort,
        die semantische Artikelsuche startest du mit Enter.
      </p>

      <div className="search-bar">
        <input
          type="text"
          autoFocus
          placeholder="z.B. Klimapolitik, Bundestag, Anthropic..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runSemanticSearch();
          }}
        />
        <button onClick={runSemanticSearch} disabled={!query.trim() || semanticLoading}>
          {semanticLoading ? "Suche…" : "Suchen"}
        </button>
      </div>

      {query.trim() && (
        <div className="search-results">
          {labelMatches.length > 0 && (
            <div className="search-section">
              <h3>Labels</h3>
              <div className="search-label-list">
                {labelMatches.map((l) => (
                  <button key={l.id} className="search-label-chip" onClick={() => goToLabel(l)}>
                    {l.name}
                    <span className="search-label-type">{l.label_type}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {labelLoading && labelMatches.length === 0 && (
            <div className="loading-hint">Suche Labels…</div>
          )}

          {semanticSearched && (
            <div className="search-section">
              <h3>Artikel</h3>
              {semanticLoading ? (
                <div className="loading-hint">Suche semantisch…</div>
              ) : semanticResults.length === 0 ? (
                <div className="loading-hint">Keine passenden Artikel gefunden.</div>
              ) : (
                <div className="search-article-list">
                  {semanticResults.map((r) => (
                    <div key={r.id} className="search-article-card">
                      <div className="search-article-title">{r.title ?? "Kein Titel"}</div>
                      <div className="search-article-meta">
                        <span>{(r.similarity * 100).toFixed(1)}% ähnlich</span>
                        <Link to={`/articles/${r.id}/context`}>Kontext anzeigen →</Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!hasAnyResults && !labelLoading && !semanticLoading && semanticSearched && (
            <div className="loading-hint">Keine Treffer.</div>
          )}
        </div>
      )}
    </div>
  );
}