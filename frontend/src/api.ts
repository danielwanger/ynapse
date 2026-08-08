import axios from "axios";

// Während der lokalen Entwicklung zeigt das auf dein lokal laufendes Backend.
// Vor dem Deploy auf die echte Backend-URL umstellen (Umgebungsvariable).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export const api = axios.create({
  baseURL: API_BASE_URL,
});