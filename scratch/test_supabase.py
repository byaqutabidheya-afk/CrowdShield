import sys
from pathlib import Path

backend_dir = Path("D:/CrowdShield/backend")
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.services import supabase_client

def main():
    zones = supabase_client.get_zone_config("cam_01")
    print(f"Zones for cam_01: {zones}")

if __name__ == "__main__":
    main()
