import LabelTree from "../components/LabelTree";
import "./page.css";

export default function TaxonomyPage() {
  return (
    <div className="page">
      <h1>Taxonomie</h1>
      <p className="page-subtitle">Themen- und Länder-Hierarchie im Überblick.</p>

      <div className="taxonomy-columns">
        <div>
          <h2>Topics</h2>
          <LabelTree labelType="topic" />
        </div>
        <div>
          <h2>Countries</h2>
          <LabelTree labelType="country" />
        </div>
      </div>
    </div>
  );
}