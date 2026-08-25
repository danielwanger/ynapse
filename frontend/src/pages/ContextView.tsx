import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api";
import "./page.css";
import "./contextview.css";

interface Label {
  id: number;
  name: string;
  label_type: string | null;
}

interface Article {
  id: number;
  title: string | null;
  url: string;
  agency: string | null;
  published_at: string | null;
  labels: Label[];
}

interface SimilarArticle {
  id: number;
  title: string | null;
  url: string;
  similarity: number;
}

interface FeedArticle {
  id: number;
  title: string;
  url: string;
  published_at: string | null;
}

interface FeedResponse {
  total: number;
  results: FeedArticle[];
}

interface LabelSection {
  label: Label;
  articles: FeedArticle[];
  loading: boolean;
}

export default function ContextView() {
  const { articleId } = useParams<{ articleId: string }>();
  const [article, setArticle] = useState<Article | null>(null);
  const [loadingArticle, setLoadingArticle] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [similarArticles, setSimilarArticles] = useState<SimilarArticle[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);

  const [sections, setSections] = useState<LabelSection[]>([]);

  // Artikel laden. AbortController verhindert, dass in React StrictMode
  // (Dev-Modus feuert Effects zweimal) zwei fast gleichzeitige identische
  // Requests dieselbe wiederverwendete HTTP/2-Connection im
  // Supabase-Client-Pool treffen -- das fuehrte serverseitig gelegentlich
  // zu "Server disconnected" (RemoteProtocolError) beim zweiten Request.
  useEffect(() => {
    if (!articleId) return;
    const controller = new AbortController();

    setLoadingArticle(true);
    setNotFound(false);
    api
      .get(`/articles/${articleId}`, { signal: controller.signal })
      .then((r) => setArticle(r.data))
      .catch((err) => {
        if (err.name !== "CanceledError" && err.code !== "ERR_CANCELED") {
          setNotFound(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingArticle(false);
      });

    return () => controller.abort();
  }, [articleId]);

  // Semantisch ähnliche Artikel (Embedding, aus vorhandenem Vektor)
  useEffect(() => {
    if (!articleId) return;
    const controller = new AbortController();

    setLoadingSimilar(true);
    api
      .get(`/articles/${articleId}/similar`, { params: { limit: 5 }, signal: controller.signal })
      .then((r) => setSimilarArticles(r.data))
      .catch((err) => {
        if (err.name !== "CanceledError" && err.code !== "ERR_CANCELED") {
          setSimilarArticles([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingSimilar(false);
      });

    return () => controller.abort();
  }, [articleId]);

  // Verwandte Artikel nach manuellem Topic-Label, über den bestehenden /feed/ Endpoint
  useEffect(() => {
    if (!article) return;
    const controller = new AbortController();

    const topicLabels = article.labels.filter((l) => l.label_type === "topic");
    setSections(topicLabels.map((label) => ({ label, articles: [], loading: true })));

    topicLabels.forEach((label, idx) => {
      api
        .get<FeedResponse>("/feed/", {
          params: { label_ids: [label.id], page: 1, page_size: 6 },
          signal: controller.signal,
        })
        .then((r) => {
          const articles = r.data.results.filter((a) => a.id !== Number(article.id));
          setSections((prev) =>
            prev.map((s, i) => (i === idx ? { ...s, articles, loading: false } : s))
          );
        })
        .catch((err) => {
          if (err.name !== "CanceledError" && err.code !== "ERR_CANCELED") {
            setSections((prev) =>
              prev.map((s, i) => (i === idx ? { ...s, articles: [], loading: false } : s))
            );
          }
        });
    });

    return () => controller.abort();
  }, [article]);

  if (loadingArticle) return <div className="page context-view">Lade Artikel…</div>;
  if (notFound || !article)
    return <div className="page context-view">Artikel nicht gefunden.</div>;

  return (
    <div className="page context-view">
      <div className="context-article-header">
        <h1>{article.title ?? "Kein Titel"}</h1>
        <div className="context-meta">
          {article.agency && <span className="meta-chip">{article.agency}</span>}
          {article.published_at && (
            <span className="meta-chip">
              {new Date(article.published_at).toLocaleDateString("de-DE")}
            </span>
          )}
        </div>
        <a href={article.url} target="_blank" rel="noopener noreferrer" className="article-url">
          {article.url}
        </a>
      </div>

      {article.labels.length > 0 && (
        <div className="context-labels-block">
          <h3>Labels</h3>
          <div className="context-labels-list">
            {article.labels.map((label) => (
              <span key={label.id} className="label-tag">
                {label.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="context-similar">
        <h3>Semantisch ähnliche Artikel</h3>
        {loadingSimilar ? (
          <div className="loading-hint">Lade…</div>
        ) : similarArticles.length === 0 ? (
          <div className="loading-hint">Keine ähnlichen Artikel gefunden.</div>
        ) : (
          <div className="related-articles-grid">
            {similarArticles.map((a) => (
              <Link key={a.id} to={`/articles/${a.id}/context`} className="related-article-card">
                <div className="related-article-title">{a.title ?? "Kein Titel"}</div>
                <div className="related-article-meta">
                  <span>{(a.similarity * 100).toFixed(1)}% ähnlich</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {sections.length > 0 && (
        <div className="context-related">
          <h3>Verwandte Artikel nach Thema</h3>
          {sections.map((section) => (
            <div key={section.label.id} className="related-section">
              <h4 className="related-section-title">{section.label.name}</h4>

              {section.loading ? (
                <div className="loading-hint">Lade…</div>
              ) : section.articles.length === 0 ? (
                <div className="loading-hint">Keine weiteren Artikel.</div>
              ) : (
                <div className="related-articles-grid">
                  {section.articles.map((a) => (
                    <Link
                      key={a.id}
                      to={`/articles/${a.id}/context`}
                      className="related-article-card"
                    >
                      <div className="related-article-title">{a.title}</div>
                      <div className="related-article-meta">
                        {a.published_at && (
                          <span>{new Date(a.published_at).toLocaleDateString("de-DE")}</span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}