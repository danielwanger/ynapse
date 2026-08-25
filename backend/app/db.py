import os
import httpx
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# Kuerzeres keepalive_expiry als httpx-Default (5 Min): verwirft
# wiederverwendete Connections proaktiv nach 20s Idle-Zeit, statt zu
# warten, bis Supabase/Cloudflare sie serverseitig schliesst und der
# naechste Request mit "RemoteProtocolError: Server disconnected"
# abbricht. Reduziert die Haeufigkeit des Fehlers an der Wurzel (der
# @with_retry-Decorator bleibt zusaetzlich als Sicherheitsnetz fuer
# die restlichen Faelle bestehen).
#
# Der supabase-py Client akzeptiert je nach installierter Version keinen
# eigenen httpx_client-Parameter in ClientOptions (TypeError:
# unexpected keyword argument). Deshalb wird hier stattdessen der
# globale httpx-Default gepatcht, BEVOR create_client() den internen
# Client baut -- funktioniert unabhaengig von der supabase-py-Version.
_original_httpx_client_init = httpx.Client.__init__


def _patched_httpx_client_init(self, *args, **kwargs):
    kwargs.setdefault("limits", httpx.Limits(keepalive_expiry=20.0))
    _original_httpx_client_init(self, *args, **kwargs)


httpx.Client.__init__ = _patched_httpx_client_init

# Service-Role-Key: nur backend-seitig verwenden, niemals ans Frontend geben.
# Er umgeht Row Level Security komplett -- das Backend selbst ist die
# einzige Zugriffskontrolle für Schreiboperationen.
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Patch zuruecksetzen, damit andere Teile der App (falls vorhanden) nicht
# unerwartet beeinflusst werden -- der erstellte supabase-Client behaelt
# seine bereits konfigurierten Limits.
httpx.Client.__init__ = _original_httpx_client_init