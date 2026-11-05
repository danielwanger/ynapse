import { Routes, Route } from "react-router-dom";
import Nav from "./components/Nav";
import Footer from "./components/Footer";
import SearchPage from "./pages/SearchPage";
import TaxonomyPage from "./pages/TaxonomyPage";
import TopicHubPage from "./pages/TopicHubPage";
import FeedPage from "./pages/FeedPage";
import GraphPage from "./pages/GraphPage";
import ContextView from "./pages/ContextView";
import WeeklyView from "./pages/WeeklyView";
import ImpressumPage from "./pages/ImpressumPage";
import DatenschutzPage from "./pages/DatenschutzPage";

function App() {
  return (
    <div>
      <Nav />
      <Routes>
        <Route path="/" element={<SearchPage />} />
        <Route path="/new" element={<WeeklyView />} />
        <Route path="/topics" element={<TaxonomyPage />} />
        <Route path="/topics/:labelId" element={<TopicHubPage />} />
        <Route path="/feed" element={<FeedPage />} />
        <Route path="/graph" element={<GraphPage />} />
        <Route path="/articles/:articleId/context" element={<ContextView />} />
        <Route path="/impressum" element={<ImpressumPage />} />
        <Route path="/datenschutz" element={<DatenschutzPage />} />
      </Routes>
      <Footer />
    </div>
  );
}

export default App;