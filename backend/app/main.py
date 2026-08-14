from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from labels import router as labels_router
from feed import router as feed_router
from search import router as search_router
from articles import router as article_router

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Ynapse Portfolio API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Nur die Portfolio-Domain darf die API vom Browser aus ansprechen.
# localhost bleibt für lokale Entwicklung drin -- vor dem echten Deploy
# durch die finale Domain ersetzen/ergänzen.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://magical-melba-7d45f1.netlify.app",
        "https://ynapse.org",
        "https://www.ynapse.org",
    ],
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(search_router)
app.include_router(labels_router)
app.include_router(feed_router)
app.include_router(article_router)


@app.get("/health")
def health():
    return {"status": "ok"}