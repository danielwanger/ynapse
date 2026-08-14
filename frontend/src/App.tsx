import { Routes, Route } from "react-router-dom";
import Nav from "./components/Nav";
import SearchPage from "./pages/SearchPage";
import TaxonomyPage from "./pages/TaxonomyPage";
import FeedPage from "./pages/FeedPage";
import GraphPage from "./pages/GraphPage";
import ContextView from "./pages/ContextView";

function App() {
  return (
    <div>
      <Nav />
      <Routes>
        <Route path="/" element={<SearchPage />} />
        <Route path="/topics" element={<TaxonomyPage />} />
        <Route path="/feed" element={<FeedPage />} />
        <Route path="/graph" element={<GraphPage />} />
        <Route path="/articles/:articleId/context" element={<ContextView />} />
      </Routes>
    </div>
  );
}

export default App;