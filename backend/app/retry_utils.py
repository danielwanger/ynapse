"""
Retry-Decorator fuer transiente Verbindungsfehler gegen Supabase
(httpx.RemoteProtocolError: "Server disconnected"). Tritt gelegentlich
auf, wenn eine wiederverwendete HTTP/2-Connection im Pool serverseitig
geschlossen wurde, waehrend ein neuer Request sie noch nutzen wollte --
kein Datenproblem, sondern ein Connection-Pooling-Rennen. Ein einzelner
Retry mit kurzer Pause behebt das in der Praxis zuverlaessig, da die
zweite Anfrage eine frische Connection aus dem Pool bekommt.

Verwendung: @with_retry ueber jede Endpoint-Funktion setzen, die
supabase.execute() aufruft.
"""
import time
import logging
from functools import wraps
from httpx import RemoteProtocolError

logger = logging.getLogger(__name__)


def with_retry(max_attempts: int = 4, delay_seconds: float = 0.3):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exc = None
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except RemoteProtocolError as e:
                    last_exc = e
                    logger.warning(
                        f"{func.__name__}: RemoteProtocolError (Versuch {attempt + 1}/{max_attempts}), retry..."
                    )
                    if attempt < max_attempts - 1:
                        time.sleep(delay_seconds)
            raise last_exc
        return wrapper
    return decorator