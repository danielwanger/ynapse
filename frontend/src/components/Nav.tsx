import { NavLink, Link } from "react-router-dom";
import "./nav.css";

export default function Nav() {
  return (
    <nav className="nav">
      <Link to="/" className="nav-brand">
        <img src="/Y_Icon_2.0.2.svg" alt="Ynapse" className="nav-logo" />
        Ynapse
      </Link>
      <div className="nav-links">
        <NavLink to="/new" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          Wochenschau
        </NavLink>
        <NavLink to="/topics" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          Themen
        </NavLink>
        <NavLink to="/feed" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
          Artikel
        </NavLink>
      </div>
    </nav>
  );
}