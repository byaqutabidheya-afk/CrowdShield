import sys
from pathlib import Path

# Setup paths
backend_dir = Path("D:/CrowdShield/backend")
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.services import supabase_client

def main():
    zones = supabase_client.get_zone_config("cam_01")
    for zone in zones:
        zone["max_expected_count"] = 50
    
    updated = supabase_client.upsert_zone_config(zones)
    print("Updated zones:", updated)

if __name__ == "__main__":
    main()
