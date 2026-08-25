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

const DAYS = 7;
const LIMIT = 12;

export default function WeeklyView() {
  const [topics, setTopics] = useState<TrendingTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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
          {topics.map((topic, idx) => (
            <Link
              key={topic.label_id}
              to={`/topics/${topic.label_id}`}
              className="weekly-topic-card"
            >
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
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}