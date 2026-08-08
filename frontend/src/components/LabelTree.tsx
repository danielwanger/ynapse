import { useEffect, useState } from "react";
import { api } from "../api";

interface LabelNode {
  id: number;
  name: string;
  label_type: string;
  parent_id: number | null;
  depth: number;
  path: number[];
}

interface LabelTreeProps {
  labelType?: "topic" | "country";
}

export default function LabelTree({ labelType }: LabelTreeProps) {
  const [labels, setLabels] = useState<LabelNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = labelType ? { label_type: labelType } : {};
        const { data } = await api.get<LabelNode[]>("/labels/", { params });
        setLabels(data);
      } catch (err) {
        console.error(err);
        setError("Konnte Labels nicht laden -- läuft das Backend?");
      } finally {
        setLoading(false);
      }
    })();
  }, [labelType]);

  if (loading) return <div>Lade Taxonomie...</div>;
  if (error) return <div style={{ color: "crimson" }}>{error}</div>;
  if (labels.length === 0) return <div>Keine Labels gefunden.</div>;

  return (
    <ul style={{ listStyle: "none", paddingLeft: 0 }}>
      {labels.map((l) => (
        <li key={l.id} style={{ paddingLeft: `${l.depth * 20}px` }}>
          {l.name}
        </li>
      ))}
    </ul>
  );
}