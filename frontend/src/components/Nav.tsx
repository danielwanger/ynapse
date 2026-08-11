import { NavLink } from "react-router-dom";
import "./nav.css";

export default function Nav() {
  return (
    <nav className="nav">
      <div className="nav-brand">
        <img src="/Y_Icon_2.0.2.svg" alt="Ynapse" className="nav-logo" />
        Ynapse
      </div>
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