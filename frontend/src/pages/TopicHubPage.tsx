import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api";
import "./topichub.css";

interface LabelRef {
  id: number;
  name: string;
}

interface HubData {
  id: number;
  name: string;
  label_type: "topic" | "country";
  parents: LabelRef[];
  children: LabelRef[];
  article_count: number;
}

interface FeedArticle {
  id: number;
  title: string;
  url: string;
  meta_description: string | null;
  published_at: string | null;
}

interface FeedResponse {
  total: number;
  results: FeedArticle[];
}

const PAGE_SIZE = 10;

export default function TopicHubPage() {
  const { labelId } = useParams<{ labelId: string }>();

  const [hub, setHub] = useState<HubData | null>(null);
  const [loadingHub, setLoadingHub] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [articles, setArticles] = useState<FeedArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingArticles, setLoadingArticles] = useState(true);

  // AbortController pro Effect-Durchlauf: verhindert, dass in React
  // StrictMode (Dev-Modus feuert Effects zweimal) zwei fast gleichzeitige
  // identische Requests dieselbe wiederverwendete HTTP/2-Connection im
  // Supabase-Client-Pool treffen -- das fuehrte serverseitig gelegentlich
  // zu "Server disconnected" (RemoteProtocolError) beim zweiten Request.
  // Der erste (veraltete) Request wird hier sauber abgebrochen, bevor der
  // zweite startet, statt beide parallel laufen zu lassen.
  useEffect(() => {
    if (!labelId) return;
    const controller = new AbortController();

    setLoadingHub(true);
    setNotFound(false);
    setPage(1);
    api
      .get<HubData>(`/labels/${labelId}/hub`, { signal: controller.signal })
      .then((r) => setHub(r.data))
      .catch((err) => {
        if (err.name !== "CanceledError" && err.code !== "ERR_CANCELED") {
          setNotFound(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingHub(false);
      });

    return () => controller.abort();
  }, [labelId]);

  useEffect(() => {
    if (!hub) return;
    const controller = new AbortController();

    setLoadingArticles(true);
    const paramKey = hub.label_type === "country" ? "country_ids" : "label_ids";
    api
      .get<FeedResponse>("/feed/", {
        params: { [paramKey]: [hub.id], page, page_size: PAGE_SIZE },
        signal: controller.signal,
      })
      .then((r) => {
        setArticles(r.data.results);
        setTotal(r.data.total);
      })
      .catch((err) => {
        if (err.name !== "CanceledError" && err.code !== "ERR_CANCELED") {
          setArticles([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingArticles(false);
      });

    return () => controller.abort();
  }, [hub, page]);

  if (loadingHub) return <div className="page">Lade…</div>;
  if (notFound || !hub) return <div className="page">Label nicht gefunden.</div>;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const graphLink = `/graph?${hub.label_type}=${hub.id}`;
  const feedLink = `/feed?${hub.label_type}=${hub.id}`;

  return (
    <div className="page hub-page">
      {hub.parents.length > 0 && (
        <div className="hub-breadcrumb">
          {hub.parents.map((p, i) => (
            <span key={p.id}>
              <Link to={`/topics/${p.id}`}>{p.name}</Link>
              {i < hub.parents.length - 1 && <span className="hub-breadcrumb-sep">, </span>}
            </span>
          ))}
        </div>
      )}

      <div className="hub-header">
        <h1>{hub.name}</h1>
        <span className="hub-type-badge">{hub.label_type}</span>
      </div>
      <div className="hub-meta">
        <span>{hub.article_count} Artikel</span>
        <Link to={feedLink} className="hub-graph-link">
          Im Feed filtern →
        </Link>
        <Link to={graphLink} className="hub-graph-link">
          Graph anzeigen →
        </Link>
      </div>

      {hub.children.length > 0 && (
        <div className="hub-section">
          <h3>Unterthemen</h3>
          <div className="hub-children-list">
            {hub.children.map((c) => (
              <Link key={c.id} to={`/topics/${c.id}`} className="hub-child-chip">
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="hub-section">
        <h3>Artikel</h3>
        {loadingArticles ? (
          <div className="loading-hint">Lade…</div>
        ) : articles.length === 0 ? (
          <div className="loading-hint">Keine Artikel zu diesem Label.</div>
        ) : (
          <>
            <div className="hub-article-list">
              {articles.map((a) => (
                <div key={a.id} className="hub-article-card">
                  <div className="hub-article-date">
                    {a.published_at
                      ? new Date(a.published_at).toLocaleDateString("de-DE")
                      : "Datum unbekannt"}
                  </div>
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="hub-article-title">
                    {a.title}
                  </a>
                  {a.meta_description && (
                    <div className="hub-article-desc">{a.meta_description}</div>
                  )}
                  <Link to={`/articles/${a.id}/context`} className="hub-article-context-link">
                    Kontext anzeigen →
                  </Link>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="hub-pagination">
                <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
                  ← Zurück
                </button>
                <span>{page} / {totalPages}</span>
                <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>
                  Weiter →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}