import { useEffect, useMemo, useState } from "react";
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

interface Week {
  key: string; // Montag als YYYY-MM-DD
  monday: Date; // UTC
  sunday: Date; // UTC
  isoYear: number;
  isoWeek: number;
  topics: TrendingTopic[];
}

// "Alle Wochen": großzügiges Limit. Prüfen, ob das Backend `weeks` begrenzt.
const WEEKS = 520;
const LIMIT_PER_WEEK = 12;
const PREVIEW_COUNT = 4;
const DAY_MS = 86_400_000;
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/* ---------- Datums-Helfer (alles UTC, damit keine Zeitzonen-Verschiebung) ---------- */

function parseDay(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

function mondayOf(d: Date): Date {
  const dow = d.getUTCDay() || 7; // So = 7
  return addDays(d, -(dow - 1));
}

function isoWeekOf(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow); // Donnerstag der Woche bestimmt das Jahr
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / DAY_MS + 1) / 7);
  return { year, week };
}

function fmtDM(d: Date): string {
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

function weekRange(w: Week): string {
  return `${fmtDM(w.monday)} – ${fmtDM(w.sunday)}`;
}

/* ---------- Komponente ---------- */

export default function WeeklyView() {
  const [topics, setTopics] = useState<TrendingTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [view, setView] = useState<"list" | "calendar">("list");

  // Vorschau-Cache pro Woche+Label (dasselbe Label taucht in mehreren Wochen auf)
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [previewArticles, setPreviewArticles] = useState<Record<string, PreviewArticle[]>>({});
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);

  // Listenansicht: aufgeklappte Wochen
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  // Kalenderansicht
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
  });

  useEffect(() => {
    setLoading(true);
    setError(false);
    api
      .get<TrendingTopic[]>("/trending/topics/by-week", { params: { weeks: WEEKS, limit_per_week: LIMIT_PER_WEEK } })
      .then((r) => setTopics(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  // Wochen immer Mo–So, aus week_start normalisiert
  const weeks = useMemo<Week[]>(() => {
    const map = new Map<string, Week>();
    for (const t of topics) {
      const monday = mondayOf(parseDay(t.week_start));
      const key = dayKey(monday);
      let w = map.get(key);
      if (!w) {
        const { year, week } = isoWeekOf(monday);
        w = { key, monday, sunday: addDays(monday, 6), isoYear: year, isoWeek: week, topics: [] };
        map.set(key, w);
      }
      w.topics.push(t);
    }
    return Array.from(map.values()).sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [topics]);

  const weekByKey = useMemo(() => new Map(weeks.map((w) => [w.key, w])), [weeks]);

  const yearGroups = useMemo(() => {
    const groups: { year: number; weeks: Week[] }[] = [];
    for (const w of weeks) {
      const last = groups[groups.length - 1];
      if (last && last.year === w.isoYear) last.weeks.push(w);
      else groups.push({ year: w.isoYear, weeks: [w] });
    }
    return groups;
  }, [weeks]);

  const currentMondayKey = dayKey(mondayOf(new Date()));
  const todayKey = dayKey(new Date());

  // Initial: nur neueste Woche offen / ausgewählt
  useEffect(() => {
    if (initialized || weeks.length === 0) return;
    setOpenWeeks(new Set([weeks[0].key]));
    setSelectedWeek(weeks[0].key);
    setInitialized(true);
  }, [weeks, initialized]);

  const toggleWeek = (key: string) => {
    setOpenWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleExpand = (e: React.MouseEvent, labelId: number, week: Week) => {
    e.preventDefault();
    e.stopPropagation();

    const k = `${week.key}:${labelId}`;
    if (expandedKey === k) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(k);

    if (!previewArticles[k]) {
      setPreviewLoading(k);
      api
        .get<FeedResponse>("/feed/", {
          params: {
            label_ids: [labelId],
            page: 1,
            page_size: PREVIEW_COUNT,
            date_from: week.monday.toISOString(),
            date_to: addDays(week.monday, 7).toISOString(), // exklusiv: nächster Montag 00:00
          },
        })
        .then((r) => setPreviewArticles((prev) => ({ ...prev, [k]: r.data.results })))
        .catch(() => setPreviewArticles((prev) => ({ ...prev, [k]: [] })))
        .finally(() => setPreviewLoading(null));
    }
  };

  const renderTopics = (week: Week) => (
    <div className="weekly-topics-list">
      {week.topics.map((topic, idx) => {
        const k = `${week.key}:${topic.label_id}`;
        const isExpanded = expandedKey === k;
        const articles = previewArticles[k];

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
                onClick={(e) => toggleExpand(e, topic.label_id, week)}
                aria-label={isExpanded ? "Vorschau schliessen" : "Artikel anzeigen"}
              >
                ▾
              </button>
            </Link>

            {isExpanded && (
              <div className="weekly-topic-preview">
                {previewLoading === k ? (
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
  );

  /* ---------- Listenansicht ---------- */

  const renderList = () =>
    yearGroups.map((g) => (
      <section key={g.year} className="weekly-year-section">
        <h2 className="weekly-year-heading">{g.year}</h2>
        {g.weeks.map((w) => {
          const isOpen = openWeeks.has(w.key);
          const tag = w.key === currentMondayKey ? "Diese Woche" : null;
          return (
            <div key={w.key} className="weekly-week-section">
              <h3 className="weekly-week-heading-wrap">
                <button className="weekly-week-heading" onClick={() => toggleWeek(w.key)} aria-expanded={isOpen}>
                  <span>
                    KW {w.isoWeek}
                    <span className="weekly-week-range"> · {weekRange(w)}</span>
                    {tag && <span className="weekly-week-tag">{tag}</span>}
                  </span>
                  <span className={`weekly-week-chevron ${isOpen ? "expanded" : ""}`}>▾</span>
                </button>
              </h3>
              {isOpen && renderTopics(w)}
            </div>
          );
        })}
      </section>
    ));

  /* ---------- Kalenderansicht ---------- */

  const calendarRows = useMemo(() => {
    const first = new Date(Date.UTC(month.year, month.month, 1));
    const last = new Date(Date.UTC(month.year, month.month + 1, 0));
    const rows: Date[] = []; // Montage
    for (let m = mondayOf(first); m <= last; m = addDays(m, 7)) rows.push(m);
    return rows;
  }, [month]);

  const shiftMonth = (delta: number) => {
    setMonth((m) => {
      const d = new Date(Date.UTC(m.year, m.month + delta, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });
  };

  const goToday = () => {
    const now = new Date();
    setMonth({ year: now.getUTCFullYear(), month: now.getUTCMonth() });
  };

  const monthTitle = new Date(Date.UTC(month.year, month.month, 1)).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const renderCalendar = () => {
    const selected = selectedWeek ? weekByKey.get(selectedWeek) : undefined;

    return (
      <div className="weekly-cal">
        <div className="weekly-cal-nav">
          <button className="weekly-cal-btn" onClick={() => shiftMonth(-1)} aria-label="Vorheriger Monat">
            ‹
          </button>
          <span className="weekly-cal-title">{monthTitle}</span>
          <button className="weekly-cal-btn" onClick={() => shiftMonth(1)} aria-label="Nächster Monat">
            ›
          </button>
          <button className="weekly-cal-btn weekly-cal-today" onClick={goToday}>
            Heute
          </button>
        </div>

        <div className="weekly-cal-grid weekly-cal-head">
          <span className="weekly-cal-kw">KW</span>
          {WEEKDAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
          <span className="weekly-cal-meta" />
        </div>

        {calendarRows.map((monday) => {
          const key = dayKey(monday);
          const week = weekByKey.get(key);
          const { week: kw } = isoWeekOf(monday);
          const isSelected = selectedWeek === key;

          return (
            <button
              key={key}
              className={`weekly-cal-grid weekly-cal-row ${week ? "has-data" : ""} ${isSelected ? "selected" : ""}`}
              disabled={!week}
              onClick={() => week && setSelectedWeek(key)}
              aria-pressed={isSelected}
              aria-label={`KW ${kw}${week ? `, ${week.topics.length} Themen` : ", keine Daten"}`}
            >
              <span className="weekly-cal-kw">{kw}</span>
              {Array.from({ length: 7 }, (_, i) => {
                const day = addDays(monday, i);
                const inMonth = day.getUTCMonth() === month.month;
                const isToday = dayKey(day) === todayKey;
                return (
                  <span
                    key={i}
                    className={`weekly-cal-day ${inMonth ? "" : "outside"} ${isToday ? "today" : ""}`}
                  >
                    {day.getUTCDate()}
                  </span>
                );
              })}
              <span className="weekly-cal-meta">{week ? `${week.topics.length} Themen` : ""}</span>
            </button>
          );
        })}

        <div className="weekly-cal-detail">
          {selected ? (
            <>
              <h3 className="weekly-cal-detail-title">
                KW {selected.isoWeek} / {selected.isoYear}
                <span className="weekly-week-range"> · {weekRange(selected)}</span>
              </h3>
              {renderTopics(selected)}
            </>
          ) : (
            <div className="weekly-loading-hint">Woche im Kalender auswählen.</div>
          )}
        </div>
      </div>
    );
  };

  /* ---------- Render ---------- */

  return (
    <div className="page">
      <h1>Wochenschau</h1>
      <p className="page-subtitle">Die aktivsten Themen aus {weeks.length} Kalenderwochen</p>

      {!loading && !error && weeks.length > 0 && (
        <div className="weekly-view-toggle" role="tablist" aria-label="Ansicht">
          <button
            role="tab"
            aria-selected={view === "list"}
            className={view === "list" ? "active" : ""}
            onClick={() => setView("list")}
          >
            Liste
          </button>
          <button
            role="tab"
            aria-selected={view === "calendar"}
            className={view === "calendar" ? "active" : ""}
            onClick={() => setView("calendar")}
          >
            Kalender
          </button>
        </div>
      )}

      {loading ? (
        <div className="weekly-loading-hint">Lade…</div>
      ) : error ? (
        <div className="weekly-loading-hint">Wochenschau konnte nicht geladen werden.</div>
      ) : weeks.length === 0 ? (
        <div className="weekly-loading-hint">Keine Artikel im ausgewählten Zeitraum.</div>
      ) : view === "list" ? (
        renderList()
      ) : (
        renderCalendar()
      )}
    </div>
  );
}