import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import MultiSelectFilter from "./MultiSelectFilter";
import "./feedview.css";

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
  const [searchParams] = useSearchParams();
  const initialTopic = searchParams.get("topic");
  const initialCountry = searchParams.get("country");

  const [articles, setArticles] = useState<FeedArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [topicLabels, setTopicLabels] = useState<Label[]>([]);
  const [countryLabels, setCountryLabels] = useState<Label[]>([]);

  const [filterAgency, setFilterAgency] = useState<number | "">("");
  const [filterLabels, setFilterLabels] = useState<number[]>(
    initialTopic ? [Number(initialTopic)] : []
  );
  const [filterCountries, setFilterCountries] = useState<number[]>(
    initialCountry ? [Number(initialCountry)] : []
  );
  const [filterExcludeLabels, setFilterExcludeLabels] = useState<number[]>([]);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterUndated, setFilterUndated] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(Boolean(initialTopic || initialCountry));

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
  const activeFilterCount =
    (filterAgency !== "" ? 1 : 0) +
    filterLabels.length +
    filterCountries.length +
    filterExcludeLabels.length +
    (filterDateFrom ? 1 : 0) +
    (filterDateTo ? 1 : 0) +
    (filterUndated ? 1 : 0);

  const resetPage = () => setPage(1);

  // Bei genau einem aktiven Topic- oder Country-Filter (und sonst keinem)
  // kann der Labelgraph gefiltert auf dieses eine Label geöffnet werden.
  const graphLink =
    filterLabels.length === 1 && filterCountries.length === 0
      ? `/graph?topic=${filterLabels[0]}`
      : filterCountries.length === 1 && filterLabels.length === 0
      ? `/graph?country=${filterCountries[0]}`
      : null;

  return (
    <div className="feed">
      <div className="feed-header">
        <h1>Feed</h1>
        <span className="feed-count">{total} Artikel</span>
        {graphLink && (
          <Link to={graphLink} className="feed-graph-link">
            Graph anzeigen →
          </Link>
        )}
        <button className="feed-filter-toggle" onClick={() => setFiltersOpen(!filtersOpen)}>
          Filter {activeFilterCount > 0 && <span className="feed-filter-badge">{activeFilterCount}</span>}
        </button>
      </div>

      {filtersOpen && (
        <div className="feed-filters">
          <div className="feed-filters-row">
            <div className="msf">
              <label className="msf-label">Agentur</label>
              <select
                className="msf-input"
                value={filterAgency}
                onChange={(e) => {
                  setFilterAgency(e.target.value ? Number(e.target.value) : "");
                  resetPage();
                }}
              >
                <option value="">Alle</option>
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            <div className="msf">
              <label className="msf-label">Zeitraum</label>
              <div style={{ display: "flex", gap: "6px" }}>
                <input type="date" className="msf-input" value={filterDateFrom} onChange={(e) => { setFilterDateFrom(e.target.value); resetPage(); }} />
                <input type="date" className="msf-input" value={filterDateTo} onChange={(e) => { setFilterDateTo(e.target.value); resetPage(); }} />
              </div>
            </div>

            <label className="feed-checkbox">
              <input
                type="checkbox"
                checked={filterUndated}
                onChange={(e) => { setFilterUndated(e.target.checked); resetPage(); }}
              />
              Ohne Datum
            </label>
          </div>

          <div className="feed-filters-row">
            <MultiSelectFilter
              label="Themen"
              options={topicLabels}
              selected={filterLabels}
              onChange={(ids) => { setFilterLabels(ids); resetPage(); }}
            />
            <MultiSelectFilter
              label="Länder"
              options={countryLabels}
              selected={filterCountries}
              onChange={(ids) => { setFilterCountries(ids); resetPage(); }}
            />
            <MultiSelectFilter
              label="NICHT (ausschließen)"
              options={[...topicLabels, ...countryLabels]}
              selected={filterExcludeLabels}
              onChange={(ids) => { setFilterExcludeLabels(ids); resetPage(); }}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="feed-loading">Lade...</div>
      ) : articles.length === 0 ? (
        <div className="feed-empty">Keine Artikel gefunden.</div>
      ) : (
        <>
          <div className="feed-cards">
            {articles.map((a) => (
              <div key={a.id} className="feed-card">
                <div className="feed-card-date">
                  {a.published_at ? new Date(a.published_at).toLocaleDateString("de-DE") : "Datum unbekannt"}
                </div>
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="feed-card-title">
                  {a.title}
                </a>
                {a.meta_description && <div className="feed-card-desc">{a.meta_description}</div>}
                <Link to={`/articles/${a.id}/context`} className="feed-card-context-link">
                  Kontext anzeigen →
                </Link>
              </div>
            ))}
          </div>

          <div className="feed-pagination">
            <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}>← Zurück</button>
            <span>{page} / {totalPages}</span>
            <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>Weiter →</button>
          </div>
        </>
      )}
    </div>
  );
}