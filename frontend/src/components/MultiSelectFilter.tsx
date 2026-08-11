import { useState, useRef, useEffect } from "react";
import "./multiselectfilter.css";

interface Option {
  id: number;
  name: string;
}

interface MultiSelectFilterProps {
  label: string;
  options: Option[];
  selected: number[];
  onChange: (ids: number[]) => void;
}

export default function MultiSelectFilter({ label, options, selected, onChange }: MultiSelectFilterProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = query.trim()
    ? options.filter((o) => o.name.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  const selectedOptions = options.filter((o) => selected.includes(o.id));

  const toggle = (id: number) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  };

  return (
    <div className="msf" ref={containerRef}>
      <label className="msf-label">{label}</label>

      {selectedOptions.length > 0 && (
        <div className="msf-chips">
          {selectedOptions.map((o) => (
            <span key={o.id} className="msf-chip" onClick={() => toggle(o.id)}>
              {o.name} <span className="msf-chip-x">×</span>
            </span>
          ))}
        </div>
      )}

      <input
        type="text"
        className="msf-input"
        placeholder={`${label} durchsuchen...`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
      />

      {open && filtered.length > 0 && (
        <div className="msf-dropdown">
          {filtered.slice(0, 50).map((o) => (
            <div
              key={o.id}
              className={`msf-option ${selected.includes(o.id) ? "selected" : ""}`}
              onClick={() => toggle(o.id)}
            >
              {o.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}