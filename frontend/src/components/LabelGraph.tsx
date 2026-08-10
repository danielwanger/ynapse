import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { api } from "../api";

interface LabelNode {
  id: number;
  name: string;
  label_type: string;
  parent_id: number | null;
  depth: number;
  path: number[];
}

// D3 hängt x/y/vx/vy/fx/fy zur Laufzeit an -- deshalb SimulationNodeDatum erweitern.
interface GraphNode extends d3.SimulationNodeDatum {
  id: number;
  name: string;
  label_type: string;
  depth: number;
  descendantCount: number;
}

interface GraphLink {
  source: number;
  target: number;
}

interface LabelGraphProps {
  labelType?: "topic" | "country";
}

export default function LabelGraph({ labelType }: LabelGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = labelType ? { label_type: labelType } : {};
        const { data } = await api.get<LabelNode[]>("/labels/", { params });
        renderGraph(data);
      } catch (err) {
        console.error(err);
        setError("Konnte Taxonomie nicht laden.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelType]);

  function renderGraph(labels: LabelNode[]) {
    if (!svgRef.current) return;

    const width = 800;
    const height = 600;

    // Reachability statt reiner Nachkommenzählung: wie nah an der Wurzel UND wie
    // stark vernetzt ein Knoten ist. Nachkommen (abwärts) + Anzahl distinkter
    // Vorfahren über alle Pfade (aufwärts, relevant bei mehreren Eltern im DAG) --
    // ein Knoten, durch den viele Pfade laufen, wird dadurch größer, unabhängig
    // davon, ob er selbst viele direkte Kinder hat.
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
    const reachability = (id: number) =>
      (descendantCounts.get(id) ?? 0) + (ancestorSets.get(id)?.size ?? 0);

    // Die rekursive Query liefert bei mehreren Eltern mehrere Zeilen für denselben
    // Knoten (eine pro Pfad) -- Knoten müssen nach id dedupliziert werden, sonst
    // zeichnet D3 denselben Knoten mehrfach als eigenen Kreis.
    const nodeById = new Map<number, GraphNode>();
    for (const l of labels) {
      if (!nodeById.has(l.id)) {
        nodeById.set(l.id, {
          id: l.id,
          name: l.name,
          label_type: l.label_type,
          depth: l.depth,
          descendantCount: reachability(l.id),
        });
      } else {
        // Bei mehreren Pfaden die geringste Tiefe für die radiale Position nehmen --
        // ein Knoten mit mehreren Eltern soll so nah wie möglich am Zentrum sitzen.
        const existing = nodeById.get(l.id)!;
        if (l.depth < existing.depth) existing.depth = l.depth;
      }
    }
    const nodes: GraphNode[] = Array.from(nodeById.values());

    // Kern fixieren: Wurzeln (depth 0) im Zentrum, Superparents (depth 1) auf einem
    // Ring darum -- entspricht dem manuell positionierbaren Kern aus dem
    // Obsidian-Plugin. Alles ab depth 2 bleibt frei beweglich im Force-Layout.
    const superparents = nodes.filter((n) => n.depth === 1);
    superparents.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / Math.max(superparents.length, 1);
      n.fx = width / 2 + 140 * Math.cos(angle);
      n.fy = height / 2 + 140 * Math.sin(angle);
    });
    nodes
      .filter((n) => n.depth === 0)
      .forEach((n) => {
        n.fx = width / 2;
        n.fy = height / 2;
      });

    // Kanten deduplizieren -- dieselbe Eltern-Kind-Beziehung soll nur eine Linie
    // ergeben, auch wenn sie über mehrere path-Zeilen mehrfach auftaucht.
    const seenLinks = new Set<string>();
    const links: GraphLink[] = [];
    for (const l of labels) {
      if (l.parent_id === null) continue;
      const key = `${l.parent_id}-${l.id}`;
      if (seenLinks.has(key)) continue;
      seenLinks.add(key);
      links.push({ source: l.parent_id, target: l.id });
    }

    const radiusScale = d3
      .scaleSqrt()
      .domain([0, d3.max(nodes, (n) => n.descendantCount) || 1])
      .range([6, 28]);

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // vorherigen Render sauber entfernen

    svg.attr("viewBox", [0, 0, width, height]);

    const g = svg.append("g");

    // Zoom/Pan, damit größere Taxonomien nicht aus dem Rahmen laufen
    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 4])
        .on("zoom", (event) => {
          g.attr("transform", event.transform);
        })
    );

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(60)
      )
      .force("charge", d3.forceManyBody().strength(-180))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collide",
        d3.forceCollide<GraphNode>().radius((d) => radiusScale(d.descendantCount) + 4)
      )
      // Wurzeln (depth 0) werden zur Mitte gezogen, tiefere Knoten weiter raus --
      // ersetzt das feste Anker-Layout der Kernknoten aus dem Obsidian-Plugin.
      .force(
        "radial",
        d3
          .forceRadial<GraphNode>((d) => d.depth * 90, width / 2, height / 2)
          .strength(0.3)
      );

    const link = g
      .append("g")
      .attr("stroke", "#ccc")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", 1.5);

    const node = g
      .append("g")
      .selectAll<SVGCircleElement, GraphNode>("circle")
      .data(nodes)
      .join("circle")
      .attr("r", (d) => radiusScale(d.descendantCount))
      .attr("fill", (d) => (d.label_type === "country" ? "#4a90d9" : "#d9824a"))
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .call(drag(simulation));

    const label = g
      .append("g")
      .selectAll("text")
      .data(nodes)
      .join("text")
      .text((d) => d.name)
      .attr("font-size", 11)
      .attr("dx", (d) => radiusScale(d.descendantCount) + 4)
      .attr("dy", 4)
      .attr("pointer-events", "none");

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as unknown as GraphNode).x!)
        .attr("y1", (d) => (d.source as unknown as GraphNode).y!)
        .attr("x2", (d) => (d.target as unknown as GraphNode).x!)
        .attr("y2", (d) => (d.target as unknown as GraphNode).y!);

      node.attr("cx", (d) => d.x!).attr("cy", (d) => d.y!);
      label.attr("x", (d) => d.x!).attr("y", (d) => d.y!);
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
      // Fixierte Kern-/Superparent-Knoten (depth 0/1) bleiben nach dem Loslassen
      // an der neuen, manuell gesetzten Position -- alle anderen werden wieder
      // dem Force-Layout überlassen.
      if (event.subject.depth > 1) {
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
      <h3>Labelgraph</h3>
      {loading && <div>Lade Graph...</div>}
      {error && <div style={{ color: "crimson" }}>{error}</div>}
      <svg ref={svgRef} style={{ width: "100%", height: "600px", border: "1px solid #eee" }} />
    </div>
  );
}