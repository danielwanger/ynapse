import { useState, useEffect } from "react";
import { api } from "../api";

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

export default function SearchLabel() {
  const [labelInput, setLabelInput] = useState("");
  const [labelMatches, setLabelMatches] = useState<Label[]>([]);
  const [labelLoading, setLabelLoading] = useState(false);

  const [semanticQuery, setSemanticQuery] = useState("");
  const [semanticResults, setSemanticResults] = useState<SemanticResult[]>([]);
  const [semanticLoading, setSemanticLoading] = useState(false);

  // Label-Textsuche, debounced (300ms) statt bei jedem Tastendruck sofort zu fetchen
  useEffect(() => {
    if (!labelInput.trim()) {
      setLabelMatches([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setLabelLoading(true);
      try {
        const { data } = await api.get<Label[]>("/labels/search", {
          params: { q: labelInput },
        });
        setLabelMatches(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLabelLoading(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [labelInput]);

  const handleSemanticSearch = async () => {
    if (!semanticQuery.trim()) return;
    setSemanticLoading(true);
    try {
      const { data } = await api.get<SemanticResult[]>("/embeddings/search", {
        params: { q: semanticQuery, limit: 10 },
      });
      setSemanticResults(data);
    } catch (err) {
      console.error(err);
    } finally {
      setSemanticLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: "500px" }}>
      <div>
        <h3>Label suchen</h3>
        <input
          type="text"
          placeholder="z.B. Politik, Wirtschaft..."
          value={labelInput}
          onChange={(e) => setLabelInput(e.target.value)}
          style={{ width: "100%", padding: "8px" }}
        />
        {labelLoading && <div>Suche...</div>}
        {labelMatches.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, marginTop: "8px" }}>
            {labelMatches.map((l) => (
              <li key={l.id} style={{ padding: "4px 0" }}>
                {l.name} <span style={{ color: "#888", fontSize: "0.8rem" }}>({l.label_type})</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3>Semantisch suchen</h3>
        <input
          type="text"
          placeholder="Beschreibe, wonach du suchst..."
          value={semanticQuery}
          onChange={(e) => setSemanticQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSemanticSearch();
          }}
          style={{ width: "100%", padding: "8px" }}
        />
        {semanticLoading && <div>Suche...</div>}
        {semanticResults.length > 0 && (
          <div style={{ marginTop: "12px" }}>
            {semanticResults.map((r) => (
              <div
                key={r.id}
                style={{
                  padding: "10px",
                  marginBottom: "8px",
                  background: "#f9f9f9",
                  borderRadius: "6px",
                }}
              >
                <a href={r.url} target="_blank" rel="noopener noreferrer">
                  {r.title || "(kein Titel)"}
                </a>
                <div style={{ fontSize: "12px", color: "#888" }}>
                  {(r.similarity * 100).toFixed(1)}% ähnlich
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}