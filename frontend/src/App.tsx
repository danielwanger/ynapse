import { Routes, Route } from "react-router-dom";
import Nav from "./components/Nav";
import TaxonomyPage from "./pages/TaxonomyPage";
import FeedPage from "./pages/FeedPage";
import SearchPage from "./pages/SearchPage";
import GraphPage from "./pages/GraphPage";

function App() {
  return (
    <div>
      <Nav />
      <Routes>
        <Route path="/" element={<TaxonomyPage />} />
        <Route path="/feed" element={<FeedPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/graph" element={<GraphPage />} />
      </Routes>
    </div>
  );
}

export default App;