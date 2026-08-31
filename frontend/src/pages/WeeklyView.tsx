import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import "./page.css";
import "./weeklyview.css";

interface TrendingTopic {
  week_start: string;
  week_end: string;
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

const WEEKS = 4;
const LIMIT_PER_WEEK = 12;
const PREVIEW_COUNT = 4;

function formatWeekLabel(weekStart: string, weekEnd: string, idx: number): string {
  if (idx === 0) return "Diese Woche";
  if (idx === 1) return "Letzte Woche";
  const start = new Date(weekStart).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  const end = new Date(weekEnd).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  return `${start} – ${end}`;
}

export default function WeeklyView() {
  const [topics, setTopics] = useState<TrendingTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [previewArticles, setPreviewArticles] = useState<Record<number, PreviewArticle[]>>({});
  const [previewLoading, setPreviewLoading] = useState<number | null>(null);

  const [collapsedWeeks, setCollapsedWeeks] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    api
      .get<TrendingTopic[]>("/trending/topics/by-week", { params: { weeks: WEEKS, limit_per_week: LIMIT_PER_WEEK } })
      .then((r) => setTopics(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  // Beim ersten Laden: nur die aktuellste Woche offen lassen, Rest eingeklappt.
  useEffect(() => {
    if (initialized || topics.length === 0) return;
    const uniqueStarts = Array.from(new Set(topics.map((t) => t.week_start))).sort((a, b) => (a < b ? 1 : -1));
    setCollapsedWeeks(new Set(uniqueStarts.slice(1)));
    setInitialized(true);
  }, [topics, initialized]);

  const toggleWeek = (weekStart: string) => {
    setCollapsedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(weekStart)) {
        next.delete(weekStart);
      } else {
        next.add(weekStart);
      }
      return next;
    });
  };

  const toggleExpand = (e: React.MouseEvent, labelId: number, weekStart: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (expandedId === labelId) {
      setExpandedId(null);
      return;
    }

    setExpandedId(labelId);

    if (!previewArticles[labelId]) {
      setPreviewLoading(labelId);
      const weekEndDate = new Date(weekStart);
      weekEndDate.setDate(weekEndDate.getDate() + 7);
      api
        .get<FeedResponse>("/feed/", {
          params: {
            label_ids: [labelId],
            page: 1,
            page_size: PREVIEW_COUNT,
            date_from: new Date(weekStart).toISOString(),
            date_to: weekEndDate.toISOString(),
          },
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

  const weekGroups = topics.reduce<Record<string, TrendingTopic[]>>((acc, t) => {
    (acc[t.week_start] ??= []).push(t);
    return acc;
  }, {});
  const weekStarts = Object.keys(weekGroups).sort((a, b) => (a < b ? 1 : -1));

  return (
    <div className="page">
      <h1>Wochenschau</h1>
      <p className="page-subtitle">Die aktivsten Themen der letzten {weekStarts.length} Wochen</p>

      {loading ? (
        <div className="weekly-loading-hint">Lade…</div>
      ) : error ? (
        <div className="weekly-loading-hint">Wochenschau konnte nicht geladen werden.</div>
      ) : weekStarts.length === 0 ? (
        <div className="weekly-loading-hint">Keine Artikel im ausgewählten Zeitraum.</div>
      ) : (
        weekStarts.map((weekStart, weekIdx) => {
          const weekTopics = weekGroups[weekStart];
          const weekEnd = weekTopics[0].week_end;
          const isCollapsed = collapsedWeeks.has(weekStart);

          return (
            <div key={weekStart} className="weekly-week-section">
              <h2 className="weekly-week-heading-wrap">
                <button
                  className="weekly-week-heading"
                  onClick={() => toggleWeek(weekStart)}
                  aria-expanded={!isCollapsed}
                >
                  <span>{formatWeekLabel(weekStart, weekEnd, weekIdx)}</span>
                  <span className={`weekly-week-chevron ${isCollapsed ? "" : "expanded"}`}>▾</span>
                </button>
              </h2>

              {!isCollapsed && (
                <div className="weekly-topics-list">
                  {weekTopics.map((topic, idx) => {
                    const isExpanded = expandedId === topic.label_id;
                    const articles = previewArticles[topic.label_id];

                    return (
                      <div key={topic.label_id} className="weekly-topic-block">
                        <Link to={`/topics/${topic.label_id}`} className="weekly-topic-card">
                          <span className="weekly-topic-rank">{idx + 1}</span>
                          <div className="weekly-topic-main">
                            <span className="weekly-topic-name">{topic.name}</span>
                          </div>
                          <span className="weekly-topic-count">{topic.article_count} Artikel</span>
                          <button
                            className={`weekly-topic-chevron ${isExpanded ? "expanded" : ""}`}
                            onClick={(e) => toggleExpand(e, topic.label_id, weekStart)}
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
                                <Link key={a.id} to={`/articles/${a.id}/context`} className="weekly-preview-article">
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
        })
      )}
    </div>
  );
}