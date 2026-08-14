import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import LabelGraph from "../components/LabelGraph";
import "./page.css";

export default function GraphPage() {
  const [searchParams] = useSearchParams();
  const topicParam = searchParams.get("topic");
  const countryParam = searchParams.get("country");

  const initialLabelType: "topic" | "country" | undefined = topicParam
    ? "topic"
    : countryParam
    ? "country"
    : undefined;
  const initialSelectedId = topicParam
    ? Number(topicParam)
    : countryParam
    ? Number(countryParam)
    : undefined;

  const [labelType, setLabelType] = useState<"topic" | "country" | undefined>(initialLabelType);

  return (
    <div className="page page-full">
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
      {/* Vorauswahl nur übergeben, solange der Nutzer nicht manuell auf einen
          anderen Typ umgeschaltet hat -- sonst würde eine Topic-Id versucht
          im Country-Graph aufgelöst zu werden. */}
      <LabelGraph
        labelType={labelType}
        initialSelectedId={labelType === initialLabelType ? initialSelectedId : undefined}
      />
    </div>
  );
}