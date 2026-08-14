import { Routes, Route } from "react-router-dom";
import Nav from "./components/Nav";
import TaxonomyPage from "./pages/TaxonomyPage";
import FeedPage from "./pages/FeedPage";
import SearchPage from "./pages/SearchPage";
import GraphPage from "./pages/GraphPage";
import ContextView from "./pages/ContextView";

function App() {
  return (
    <div>
      <Nav />
      <Routes>
        <Route path="/" element={<TaxonomyPage />} />
        <Route path="/feed" element={<FeedPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/graph" element={<GraphPage />} />
        <Route path="/articles/:articleId/context" element={<ContextView />} />
      </Routes>
    </div>
  );
}

export default App;