import { NavLink } from "react-router-dom";
import "./nav.css";

export default function Nav() {
  return (
    <nav className="nav">
      <div className="nav-brand">Ynapse</div>
      <div className="nav-links">
        <NavLink to="/" end className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          Taxonomie
        </NavLink>
        <NavLink to="/feed" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          Feed
        </NavLink>
        <NavLink to="/search" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          Suche
        </NavLink>
        <NavLink to="/graph" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          Labelgraph
        </NavLink>
      </div>
    </nav>
  );
}