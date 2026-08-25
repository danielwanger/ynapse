import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import "./page.css";
import "./weeklyview.css";

interface TrendingTopic {
  label_id: number;
  name: string;
  article_count: number;
}

interface PreviewArticle {
  id: number;
  title: string;
  url: string;
  published_at: string | null;
}

interface FeedResponse {
  total: number;
  results: PreviewArticle[];
}

const DAYS = 7;
const LIMIT = 12;
const PREVIEW_COUNT = 4;

export default function WeeklyView() {
  const [topics, setTopics] = useState<TrendingTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [previewArticles, setPreviewArticles] = useState<Record<number, PreviewArticle[]>>({});
  const [previewLoading, setPreviewLoading] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(false);
    api
      .get<TrendingTopic[]>("/trending/topics", { params: { days: DAYS, limit: LIMIT } })
      .then((r) => setTopics(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const maxCount = topics.length > 0 ? topics[0].article_count : 1;

  const toggleExpand = (e: React.MouseEvent, labelId: number) => {
    e.preventDefault();
    e.stopPropagation();

    if (expandedId === labelId) {
      setExpandedId(null);
      return;
    }

    setExpandedId(labelId);

    if (!previewArticles[labelId]) {
      setPreviewLoading(labelId);
      const dateFrom = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
      api
        .get<FeedResponse>("/feed/", {
          params: { label_ids: [labelId], page: 1, page_size: PREVIEW_COUNT, date_from: dateFrom },
        })
        .then((r) => {
          setPreviewArticles((prev) => ({ ...prev, [labelId]: r.data.results }));
        })
        .catch(() => {
          setPreviewArticles((prev) => ({ ...prev, [labelId]: [] }));
        })
        .finally(() => setPreviewLoading(null));
    }
  };

  return (
    <div className="page">
      <h1>Wochenschau</h1>
      <p className="page-subtitle">Die aktivsten Themen der letzten {DAYS} Tage</p>

      {loading ? (
        <div className="weekly-loading-hint">Lade…</div>
      ) : error ? (
        <div className="weekly-loading-hint">Wochenschau konnte nicht geladen werden.</div>
      ) : topics.length === 0 ? (
        <div className="weekly-loading-hint">Keine neuen Artikel in den letzten {DAYS} Tagen.</div>
      ) : (
        <div className="weekly-topics-list">
          {topics.map((topic, idx) => {
            const isExpanded = expandedId === topic.label_id;
            const articles = previewArticles[topic.label_id];

            return (
              <div key={topic.label_id} className="weekly-topic-block">
                <Link to={`/topics/${topic.label_id}`} className="weekly-topic-card">
                  <span className="weekly-topic-rank">{idx + 1}</span>
                  <div className="weekly-topic-main">
                    <span className="weekly-topic-name">{topic.name}</span>
                    <div className="weekly-topic-bar-track">
                      <div
                        className="weekly-topic-bar-fill"
                        style={{ width: `${(topic.article_count / maxCount) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="weekly-topic-count">
                    {topic.article_count} {topic.article_count === 1 ? "Artikel" : "Artikel"}
                  </span>
                  <button
                    className={`weekly-topic-chevron ${isExpanded ? "expanded" : ""}`}
                    onClick={(e) => toggleExpand(e, topic.label_id)}
                    aria-label={isExpanded ? "Vorschau schliessen" : "Artikel anzeigen"}
                  >
                    ▾
                  </button>
                </Link>

                {isExpanded && (
                  <div className="weekly-topic-preview">
                    {previewLoading === topic.label_id ? (
                      <div className="weekly-preview-hint">Lade…</div>
                    ) : !articles || articles.length === 0 ? (
                      <div className="weekly-preview-hint">Keine Artikel gefunden.</div>
                    ) : (
                      articles.map((a) => (
                        <Link
                          key={a.id}
                          to={`/articles/${a.id}/context`}
                          className="weekly-preview-article"
                        >
                          <span className="weekly-preview-article-title">{a.title}</span>
                          {a.published_at && (
                            <span className="weekly-preview-article-date">
                              {new Date(a.published_at).toLocaleDateString("de-DE")}
                            </span>
                          )}
                        </Link>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}