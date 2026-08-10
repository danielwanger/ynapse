import { useEffect, useState } from "react";
import { api } from "../api";

interface FeedArticle {
  id: number;
  title: string;
  url: string;
  meta_description: string | null;
  agency_id: number | null;
  published_at: string | null;
}

interface FeedResponse {
  total: number;
  page: number;
  page_size: number;
  results: FeedArticle[];
}

interface Agency {
  id: number;
  name: string;
}

interface Label {
  id: number;
  name: string;
  label_type: string;
}

const PAGE_SIZE = 20;

export default function FeedView() {
  const [articles, setArticles] = useState<FeedArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [topicLabels, setTopicLabels] = useState<Label[]>([]);
  const [countryLabels, setCountryLabels] = useState<Label[]>([]);

  const [filterAgency, setFilterAgency] = useState<number | "">("");
  const [filterLabels, setFilterLabels] = useState<number[]>([]);
  const [filterCountries, setFilterCountries] = useState<number[]>([]);
  const [filterExcludeLabels, setFilterExcludeLabels] = useState<number[]>([]);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterUndated, setFilterUndated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [agenciesRes, topicsRes, countriesRes] = await Promise.all([
          api.get<Agency[]>("/feed/agencies"),
          api.get<Label[]>("/labels/", { params: { label_type: "topic" } }),
          api.get<Label[]>("/labels/", { params: { label_type: "country" } }),
        ]);
        setAgencies(agenciesRes.data);
        setTopicLabels(topicsRes.data);
        setCountryLabels(countriesRes.data);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params: Record<string, any> = { page, page_size: PAGE_SIZE };
        if (filterAgency !== "") params.agency_id = filterAgency;
        if (filterLabels.length) params.label_ids = filterLabels;
        if (filterCountries.length) params.country_ids = filterCountries;
        if (filterExcludeLabels.length) params.exclude_label_ids = filterExcludeLabels;
        if (filterDateFrom) params.date_from = filterDateFrom;
        if (filterDateTo) params.date_to = filterDateTo;
        if (filterUndated) params.only_undated = true;

        const { data } = await api.get<FeedResponse>("/feed/", { params });
        setArticles(data.results);
        setTotal(data.total);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [page, filterAgency, filterLabels, filterCountries, filterExcludeLabels, filterDateFrom, filterDateTo, filterUndated]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggleId = (list: number[], id: number, setList: (ids: number[]) => void) => {
    if (list.includes(id)) setList(list.filter((x) => x !== id));
    else setList([...list, id]);
    setPage(1);
  };

  return (
    <div>
      <h2>Feed ({total} Artikel)</h2>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem" }}>
        <div>
          <label>Agentur: </label>
          <select
            value={filterAgency}
            onChange={(e) => {
              setFilterAgency(e.target.value ? Number(e.target.value) : "");
              setPage(1);
            }}
          >
            <option value="">Alle</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label>Von: </label>
          <input type="date" value={filterDateFrom} onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }} />
          <label> Bis: </label>
          <input type="date" value={filterDateTo} onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }} />
        </div>

        <label>
          <input
            type="checkbox"
            checked={filterUndated}
            onChange={(e) => { setFilterUndated(e.target.checked); setPage(1); }}
          />
          {" "}Ohne Datum
        </label>
      </div>

      <div style={{ display: "flex", gap: "2rem", marginBottom: "1rem" }}>
        <div>
          <strong>Themen</strong>
          <div style={{ maxHeight: "150px", overflowY: "auto" }}>
            {topicLabels.map((l) => (
              <div key={l.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={filterLabels.includes(l.id)}
                    onChange={() => toggleId(filterLabels, l.id, setFilterLabels)}
                  />
                  {" "}{l.name}
                </label>
              </div>
            ))}
          </div>
        </div>

        <div>
          <strong>Länder</strong>
          <div style={{ maxHeight: "150px", overflowY: "auto" }}>
            {countryLabels.map((l) => (
              <div key={l.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={filterCountries.includes(l.id)}
                    onChange={() => toggleId(filterCountries, l.id, setFilterCountries)}
                  />
                  {" "}{l.name}
                </label>
              </div>
            ))}
          </div>
        </div>

        <div>
          <strong>NICHT (ausschließen)</strong>
          <div style={{ maxHeight: "150px", overflowY: "auto" }}>
            {[...topicLabels, ...countryLabels].map((l) => (
              <div key={l.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={filterExcludeLabels.includes(l.id)}
                    onChange={() => toggleId(filterExcludeLabels, l.id, setFilterExcludeLabels)}
                  />
                  {" "}{l.name}
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div>Lade...</div>
      ) : articles.length === 0 ? (
        <div>Keine Artikel gefunden.</div>
      ) : (
        <>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {articles.map((a) => (
              <li key={a.id} style={{ marginBottom: "1rem", borderBottom: "1px solid #eee", paddingBottom: "0.5rem" }}>
                <div style={{ fontSize: "0.8rem", color: "#888" }}>
                  {a.published_at ? new Date(a.published_at).toLocaleDateString("de-DE") : "Datum unbekannt"}
                </div>
                <a href={a.url} target="_blank" rel="noopener noreferrer">{a.title}</a>
                {a.meta_description && <p style={{ fontSize: "0.85rem", color: "#666" }}>{a.meta_description}</p>}
              </li>
            ))}
          </ul>

          <div>
            <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}>←</button>
            <span> {page} / {totalPages} </span>
            <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>→</button>
          </div>
        </>
      )}
    </div>
  );
}