import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { api } from "../api";
import "./labelgraph.css";

interface LabelNode {
  id: number;
  name: string;
  label_type: string;
  parent_id: number | null;
  depth: number;
  path: number[];
}

interface GraphNode extends d3.SimulationNodeDatum {
  id: number;
  name: string;
  label_type: string;
  depth: number;
  reach: number;
  isCore: boolean;
  isHub: boolean;
}

interface GraphLink {
  source: number;
  target: number;
}

interface LabelGraphProps {
  labelType?: "topic" | "country";
  /**
   * Optional: Label-Id, die beim ersten Laden automatisch als gefilterter
   * Mittelpunkt ausgewählt wird (z.B. wenn man vom Feed aus über
   * "Graph anzeigen" hierher kommt). Wird nur einmal angewendet -- wenn der
   * Nutzer den Filter danach manuell zurücksetzt oder ändert, wird nicht
   * erneut eingegriffen.
   */
  initialSelectedId?: number;
}

export default function LabelGraph({ labelType, initialSelectedId }: LabelGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allLabels, setAllLabels] = useState<LabelNode[]>([]);

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<LabelNode | null>(null);

  const appliedInitial = useRef(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = labelType ? { label_type: labelType } : {};
        const { data } = await api.get<LabelNode[]>("/labels/", { params });
        setAllLabels(data);
        setSelected(null);
        setQuery("");
        appliedInitial.current = false;
      } catch (err) {
        console.error(err);
        setError("Konnte Taxonomie nicht laden.");
      } finally {
        setLoading(false);
      }
    })();
  }, [labelType]);

  // Vorauswahl einmalig anwenden, sobald die Labels geladen sind.
  useEffect(() => {
    if (allLabels.length === 0 || appliedInitial.current || initialSelectedId === undefined) return;
    const match = allLabels.find((l) => l.id === initialSelectedId);
    if (match) {
      setSelected(match);
      setQuery(match.name);
    }
    appliedInitial.current = true;
  }, [allLabels, initialSelectedId]);

  useEffect(() => {
    if (allLabels.length === 0) return;
    const subset = selected ? computeSubgraph(allLabels, selected.id) : allLabels;
    renderGraph(subset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLabels, selected]);

  function computeSubgraph(labels: LabelNode[], centerId: number): LabelNode[] {
    // Vorfahren: alle ids im path des zentralen Knotens (ausser er selbst).
    // Nachkommen: alle Knoten, deren path die centerId enthaelt.
    const centerRows = labels.filter((l) => l.id === centerId);
    const ancestorIds = new Set<number>();
    for (const row of centerRows) {
      for (const id of row.path) ancestorIds.add(id);
    }
    const relevantIds = new Set<number>(ancestorIds);
    for (const l of labels) {
      if (l.path.includes(centerId)) relevantIds.add(l.id);
    }
    return labels.filter((l) => relevantIds.has(l.id));
  }

  const searchMatches = query.trim()
    ? allLabels
        .filter((l, i, arr) => arr.findIndex((x) => x.id === l.id) === i)
        .filter((l) => l.name.toLowerCase().includes(query.trim().toLowerCase()))
        .slice(0, 20)
    : [];

  function renderGraph(labels: LabelNode[]) {
    if (!svgRef.current) return;

    const width = svgRef.current.parentElement?.clientWidth || 900;
    const height = 700;

    const descendantCounts = new Map<number, number>();
    const ancestorSets = new Map<number, Set<number>>();
    for (const l of labels) {
      for (const ancestorId of l.path) {
        if (ancestorId === l.id) continue;
        descendantCounts.set(ancestorId, (descendantCounts.get(ancestorId) ?? 0) + 1);
      }
      const ancestors = ancestorSets.get(l.id) ?? new Set<number>();
      for (const id of l.path) {
        if (id !== l.id) ancestors.add(id);
      }
      ancestorSets.set(l.id, ancestors);
    }
    const reachOf = (id: number) =>
      (descendantCounts.get(id) ?? 0) + (ancestorSets.get(id)?.size ?? 0);

    const nodeById = new Map<number, GraphNode>();
    for (const l of labels) {
      if (!nodeById.has(l.id)) {
        nodeById.set(l.id, {
          id: l.id,
          name: l.name,
          label_type: l.label_type,
          depth: l.depth,
          reach: reachOf(l.id),
          isCore: false,
          isHub: false,
        });
      } else {
        const existing = nodeById.get(l.id)!;
        if (l.depth < existing.depth) existing.depth = l.depth;
      }
    }
    const nodes: GraphNode[] = Array.from(nodeById.values());

    const reachValues = nodes.map((n) => n.reach).sort((a, b) => b - a);
    const hubThreshold = reachValues[Math.floor(reachValues.length * 0.05)] ?? Infinity;
    for (const n of nodes) {
      n.isCore = n.depth === 0;
      n.isHub = !n.isCore && n.reach >= hubThreshold && n.reach > 0;
    }

    const seenLinks = new Set<string>();
    const links: GraphLink[] = [];
    for (const l of labels) {
      if (l.parent_id === null) continue;
      if (!nodeById.has(l.parent_id) || !nodeById.has(l.id)) continue;
      const key = `${l.parent_id}-${l.id}`;
      if (seenLinks.has(key)) continue;
      seenLinks.add(key);
      links.push({ source: l.parent_id, target: l.id });
    }

    const radiusScale = d3
      .scaleSqrt()
      .domain([0, d3.max(nodes, (n) => n.reach) || 1])
      .range([4, 22]);

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", [0, 0, width, height]);

    const g = svg.append("g");

    const simulation = d3
      .forceSimulation(nodes)
      .alphaDecay(0.03)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(50)
          .strength(0.4)
      )
      .force(
        "charge",
        d3.forceManyBody<GraphNode>().strength((d) => {
          if (d.isCore) return -1200;
          if (d.isHub) return -500;
          return -150;
        })
      )
      .force(
        "collide",
        d3.forceCollide<GraphNode>((d) => {
          if (d.isCore) return radiusScale(d.reach) + 120;
          if (d.isHub) return radiusScale(d.reach) + 40;
          return radiusScale(d.reach) + 6;
        })
      )
      .force("x", d3.forceX(width / 2).strength(0.01))
      .force("y", d3.forceY(height / 2).strength(0.01));

    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on("zoom", (event) => {
          g.attr("transform", event.transform);
          updateLabelVisibility(event.transform.k);
        })
    );

    const link = g
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "#555")
      .attr("stroke-opacity", 0.4)
      .attr("stroke-width", 1.2);

    const node = g
      .append("g")
      .selectAll<SVGCircleElement, GraphNode>("circle")
      .data(nodes)
      .join("circle")
      .attr("r", (d) => radiusScale(d.reach))
      .attr("fill", (d) => {
        if (d.isCore) return "#e07a5f";
        if (d.isHub) return "#f2c14e";
        return d.label_type === "country" ? "#4a90d9" : "#69b3a2";
      })
      .attr("stroke", (d) => (d.id === selected?.id ? "#fff" : "none"))
      .attr("stroke-width", (d) => (d.id === selected?.id ? 3 : 0))
      .style("cursor", "pointer")
      .call(drag(simulation));

    node.append("title").text((d) => `${d.name} (Reach: ${d.reach})`);

    node.on("click", (_event, d) => {
      const match = allLabels.find((l) => l.id === d.id);
      if (match) setSelected(match);
    });

    const label = g
      .append("g")
      .selectAll("text")
      .data(nodes)
      .join("text")
      .text((d) => (d.isCore ? `${d.name} (${d.reach})` : d.name))
      .attr("font-size", (d) => (d.isCore ? 14 : 12))
      .attr("font-weight", (d) => (d.isCore || d.isHub ? "bold" : "normal"))
      .attr("fill", (d) => (d.isHub && !d.isCore ? "#f2c14e" : "#fff"))
      .attr("stroke", "#000")
      .attr("stroke-width", (d) => (d.isCore ? 3 : d.isHub ? 2.2 : 1.2))
      .attr("paint-order", "stroke")
      .style("pointer-events", "none")
      .style("opacity", (d) => (d.isCore || d.isHub ? 1 : 0));

    function updateLabelVisibility(scale: number) {
      label.style("opacity", (d) => {
        if (d.isCore || d.isHub) return 1;
        const threshold = d.reach > 0 ? 1.8 : 2.5;
        return scale >= threshold ? 1 : 0;
      });
    }

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as unknown as GraphNode).x!)
        .attr("y1", (d) => (d.source as unknown as GraphNode).y!)
        .attr("x2", (d) => (d.target as unknown as GraphNode).x!)
        .attr("y2", (d) => (d.target as unknown as GraphNode).y!);

      node.attr("cx", (d) => d.x!).attr("cy", (d) => d.y!);
      label.attr("x", (d) => d.x! + radiusScale(d.reach) + 4).attr("y", (d) => d.y! + 4);
    });
  }

  function drag(simulation: d3.Simulation<GraphNode, GraphLink>) {
    function dragstarted(event: d3.D3DragEvent<SVGCircleElement, GraphNode, GraphNode>) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }
    function dragged(event: d3.D3DragEvent<SVGCircleElement, GraphNode, GraphNode>) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }
    function dragended(event: d3.D3DragEvent<SVGCircleElement, GraphNode, GraphNode>) {
      if (!event.active) simulation.alphaTarget(0);
      if (!event.subject.isCore) {
        event.subject.fx = null;
        event.subject.fy = null;
      }
    }
    return d3
      .drag<SVGCircleElement, GraphNode>()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended);
  }

  return (
    <div>
      <div className="lg-controls">
        <div className="lg-search">
          <input
            type="text"
            placeholder="Label suchen, um gefiltert zu starten..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
          />
          {searchOpen && searchMatches.length > 0 && (
            <div className="lg-search-dropdown">
              {searchMatches.map((l) => (
                <div
                  key={l.id}
                  className="lg-search-option"
                  onClick={() => {
                    setSelected(l);
                    setQuery(l.name);
                    setSearchOpen(false);
                  }}
                >
                  {l.name}
                </div>
              ))}
            </div>
          )}
        </div>
        {selected && (
          <button
            className="lg-reset"
            onClick={() => {
              setSelected(null);
              setQuery("");
            }}
          >
            Filter zurücksetzen (zeige alle)
          </button>
        )}
      </div>

      {loading && <div>Lade Graph...</div>}
      {error && <div style={{ color: "crimson" }}>{error}</div>}
      <svg ref={svgRef} style={{ width: "100%", height: "700px", border: "1px solid #262626", borderRadius: "8px", background: "#0d0d0d" }} />
    </div>
  );
}