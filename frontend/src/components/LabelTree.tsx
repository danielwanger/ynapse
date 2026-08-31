import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import "./labeltree.css";

interface LabelNode {
  id: number;
  name: string;
  label_type: string;
  parent_id: number | null;
  depth: number;
  path: number[];
  article_count: number; 
}

interface TreeNode {
  id: number;
  name: string;
  articleCount: number; // NEU
  children: TreeNode[];
}

interface LabelTreeProps {
  labelType: "topic" | "country";
}

function buildTree(flat: LabelNode[]): TreeNode[] {
  const nodeMap = new Map<number, TreeNode>();
  const roots: TreeNode[] = [];

  for (const l of flat) {
    if (!nodeMap.has(l.id)) {
      nodeMap.set(l.id, { id: l.id, name: l.name, articleCount: l.article_count ?? 0, children: [] });
    }
  }

  const linked = new Set<string>();
  for (const l of flat) {
    if (l.parent_id === null) {
      if (!roots.find((r) => r.id === l.id)) roots.push(nodeMap.get(l.id)!);
      continue;
    }
    const key = `${l.parent_id}-${l.id}`;
    if (linked.has(key)) continue;
    linked.add(key);
    const parent = nodeMap.get(l.parent_id);
    const child = nodeMap.get(l.id);
    if (parent && child) parent.children.push(child);
  }

  return roots.sort((a, b) => a.name.localeCompare(b.name));
}

function TreeItem({
  node,
  depth,
  onNavigate,
}: {
  node: TreeNode;
  depth: number;
  onNavigate: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <div className="tree-item" style={{ marginLeft: depth === 0 ? 0 : 18 }}>
      <div className={`tree-row ${hasChildren ? "has-children" : ""}`}>
        {hasChildren ? (
          <span
            className={`tree-caret ${open ? "open" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(!open);
            }}
          >
            ▸
          </span>
        ) : (
          <span className="tree-caret-placeholder" />
        )}
        <span
          className="tree-name"
          style={{ cursor: "pointer" }}
          onClick={() => onNavigate(node.id)}
        >
          {node.name}
        </span>
        {/* Kinderanzahl (Taxonomie-Struktur) und Artikelanzahl (Inhalt) nebeneinander,
            damit man auf einen Blick sieht ob ein Knoten strukturell groß ODER inhaltlich befüllt ist. */}
        <span className="tree-counts">
          {hasChildren && (
            <span className="tree-count" title={`${node.children.length} Unterlabels`}>
              {node.children.length} <span className="tree-count-label">Labels</span>
            </span>
          )}
          <span className="tree-count tree-count-articles" title={`${node.articleCount} Artikel`}>
            {node.articleCount} <span className="tree-count-label">Art.</span>
          </span>
        </span>
      </div>
      {hasChildren && open && (
        <div className="tree-children">
          {node.children
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((child) => (
              <TreeItem key={child.id} node={child} depth={depth + 1} onNavigate={onNavigate} />
            ))}
        </div>
      )}
    </div>
  );
}

export default function LabelTree({ labelType }: LabelTreeProps) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get<LabelNode[]>("/labels/", {
          params: { label_type: labelType },
        });
        setTree(buildTree(data));
      } catch (err) {
        console.error(err);
        setError("Konnte Labels nicht laden -- läuft das Backend?");
      } finally {
        setLoading(false);
      }
    })();
  }, [labelType]);

  const handleNavigate = (id: number) => {
    navigate(`/topics/${id}`);
  };

  if (loading) return <div>Lade Taxonomie...</div>;
  if (error) return <div style={{ color: "crimson" }}>{error}</div>;
  if (tree.length === 0) return <div>Keine Labels gefunden.</div>;

  return (
    <div className="tree-container">
      {tree.map((node) => (
        <TreeItem key={node.id} node={node} depth={0} onNavigate={handleNavigate} />
      ))}
    </div>
  );
}