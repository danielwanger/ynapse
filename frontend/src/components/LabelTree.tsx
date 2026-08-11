import { useEffect, useState } from "react";
import { api } from "../api";
import "./labeltree.css";

interface LabelNode {
  id: number;
  name: string;
  label_type: string;
  parent_id: number | null;
  depth: number;
  path: number[];
}

interface TreeNode {
  id: number;
  name: string;
  children: TreeNode[];
}

interface LabelTreeProps {
  labelType?: "topic" | "country";
}

function buildTree(flat: LabelNode[]): TreeNode[] {
  const nodeMap = new Map<number, TreeNode>();
  const roots: TreeNode[] = [];

  // Erst alle Knoten anlegen (dedupliziert, falls ein Label mehrere
  // Eltern-Pfade hat -- hier wird es einmal als eigener Knoten gefuehrt)
  for (const l of flat) {
    if (!nodeMap.has(l.id)) {
      nodeMap.set(l.id, { id: l.id, name: l.name, children: [] });
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

function TreeItem({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = node.children.length > 0;

  return (
    <div className="tree-item" style={{ marginLeft: depth === 0 ? 0 : 18 }}>
      <div
        className={`tree-row ${hasChildren ? "has-children" : ""}`}
        onClick={() => hasChildren && setOpen(!open)}
      >
        {hasChildren ? (
          <span className={`tree-caret ${open ? "open" : ""}`}>▸</span>
        ) : (
          <span className="tree-caret-placeholder" />
        )}
        <span className="tree-name">{node.name}</span>
        {hasChildren && <span className="tree-count">{node.children.length}</span>}
      </div>
      {hasChildren && open && (
        <div className="tree-children">
          {node.children
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((child) => (
              <TreeItem key={child.id} node={child} depth={depth + 1} />
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

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = labelType ? { label_type: labelType } : {};
        const { data } = await api.get<LabelNode[]>("/labels/", { params });
        setTree(buildTree(data));
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
  if (tree.length === 0) return <div>Keine Labels gefunden.</div>;

  return (
    <div className="tree-container">
      {tree.map((node) => (
        <TreeItem key={node.id} node={node} depth={0} />
      ))}
    </div>
  );
}