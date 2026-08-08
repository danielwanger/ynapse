import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# Service-Role-Key: nur backend-seitig verwenden, niemals ans Frontend geben.
# Er umgeht Row Level Security komplett -- das Backend selbst ist die
# einzige Zugriffskontrolle für Schreiboperationen.
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)