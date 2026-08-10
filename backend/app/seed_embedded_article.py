"""
Einmaliges Skript, kein Teil der laufenden App.
Holt ein echtes Embedding von der privaten Instanz (geteiltes Modell)
und legt damit einen Test-Artikel in der Portfolio-DB an, damit die
semantische Suche ein sichtbares Ergebnis liefert.

Ausführen aus backend/app/:
    python seed_embedded_article.py
"""
import os
import httpx
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
PRIVATE_INSTANCE_URL = os.environ["PRIVATE_INSTANCE_URL"]
PRIVATE_INSTANCE_TOKEN = os.environ.get("PRIVATE_INSTANCE_TOKEN")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

TEST_ARTICLE = {
    "title": "Bundestag verabschiedet neues Haushaltsgesetz",
    "url": "https://example.com/article-embedded-1",
    "meta_description": "Der Bundestag hat nach langer Debatte ein neues Haushaltsgesetz beschlossen.",
    "published_at": "2026-08-05",
}

# Gleicher Text, der auch fürs Embedding im echten Ynapse verwendet würde --
# Titel + Beschreibung kombiniert, kein "query: "-Prefix (der ist nur für
# Suchanfragen gedacht, nicht für die zu durchsuchenden Dokumente selbst).
text_to_embed = f"{TEST_ARTICLE['title']} {TEST_ARTICLE['meta_description']}"

headers = {}
if PRIVATE_INSTANCE_TOKEN:
    headers["Authorization"] = f"Bearer {PRIVATE_INSTANCE_TOKEN}"

print("Hole Embedding von der privaten Instanz...")
resp = httpx.post(
    f"{PRIVATE_INSTANCE_URL}/embeddings/internal/embed",
    json={"text": text_to_embed},
    headers=headers,
    timeout=15.0,
)
resp.raise_for_status()
embedding = resp.json()["embedding"]
print(f"Embedding erhalten, Dimension: {len(embedding)}")

result = (
    supabase.table("articles")
    .insert({**TEST_ARTICLE, "embedding": embedding})
    .execute()
)
print("Artikel eingefügt:", result.data)