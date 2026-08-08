import LabelTree from "./components/LabelTree";

function App() {
  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Ynapse</h1>
      <h2>Topics</h2>
      <LabelTree labelType="topic" />
      <h2>Countries</h2>
      <LabelTree labelType="country" />
    </div>
  );
}

export default App;