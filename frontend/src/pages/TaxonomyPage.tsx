import { useState } from "react";
import { useNavigate } from "react-router-dom";
import LabelTree from "../components/LabelTree";
import { api } from "../api";
import "./page.css";

interface LabelSearchResult {
  id: number;
  name: string;
  label_type: string;
}

export default function TaxonomyPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LabelSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data } = await api.get<LabelSearchResult[]>("/labels/search", {
        params: { q: q.trim() },
      });
      setResults(data);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const goToLabel = (r: LabelSearchResult) => {
    setResults([]);
    setQuery("");
    navigate(`/feed?${r.label_type}=${r.id}`);
  };

  return (
    <div className="page">
      <h1>Themen</h1>
      <p className="page-subtitle">Themen- und Länder-Hierarchie im Überblick.</p>

      <div className="taxonomy-search">
        <input
          type="text"
          placeholder="Label suchen..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
        />
        {query.trim().length >= 2 && (
          <div className="taxonomy-search-dropdown">
            {searching ? (
              <div className="loading-hint">Suche…</div>
            ) : results.length === 0 ? (
              <div className="loading-hint">Keine Treffer.</div>
            ) : (
              results.map((r) => (
                <div key={r.id} className="taxonomy-search-option" onClick={() => goToLabel(r)}>
                  <span>{r.name}</span>
                  <span className="taxonomy-search-type">{r.label_type}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="taxonomy-columns">
        <div>
          <h2>Topics</h2>
          <LabelTree labelType="topic" />
        </div>
        <div>
          <h2>Countries</h2>
          <LabelTree labelType="country" />
        </div>
      </div>
    </div>
  );
}