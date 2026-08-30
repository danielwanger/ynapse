import "./footer.css";

export default function Footer() {
  return (
    <footer className="site-footer">
      <span>
        Semantische Suche powered by{" "}
        <a href="https://huggingface.co/intfloat/multilingual-e5-large" target="_blank" rel="noopener noreferrer">
          multilingual-e5-large
        </a>{" "}
        · Cosine Similarity · pgvector (Supabase/Postgres)
      </span>
    </footer>
  );
}