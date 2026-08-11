import { useState } from "react";
import LabelGraph from "../components/LabelGraph";
import "./page.css";

export default function GraphPage() {
  const [labelType, setLabelType] = useState<"topic" | "country" | undefined>(undefined);

  return (
    <div className="page">
      <h1>Labelgraph</h1>
      <div className="graph-toggle">
        <button className={labelType === undefined ? "toggle-btn active" : "toggle-btn"} onClick={() => setLabelType(undefined)}>
          Alle
        </button>
        <button className={labelType === "topic" ? "toggle-btn active" : "toggle-btn"} onClick={() => setLabelType("topic")}>
          Topics
        </button>
        <button className={labelType === "country" ? "toggle-btn active" : "toggle-btn"} onClick={() => setLabelType("country")}>
          Countries
        </button>
      </div>
      <LabelGraph labelType={labelType} />
    </div>
  );
}