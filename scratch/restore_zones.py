import sys
from pathlib import Path

backend_dir = Path("D:/CrowdShield/backend")
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

ai_core_dir = Path("D:/CrowdShield/ai_core")
if str(ai_core_dir) not in sys.path:
    sys.path.insert(0, str(ai_core_dir))

from app.services import supabase_client
from shared.zone_config import generate_grid_zones

def main():
    zones = generate_grid_zones(2, 2)
    payload = []
    for z in zones:
        zone_dict = z.to_dict()
        zone_dict["venue_id"] = "cam_01"
        payload.append(zone_dict)
    
    updated = supabase_client.upsert_zone_config(payload)
    print("Restored zones:", len(updated))

if __name__ == "__main__":
    main()

