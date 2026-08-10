import sys
import os

# 1. Get the directory this test script is in (ai-core/scripts/)
current_dir = os.path.dirname(os.path.abspath(__file__))

# 2. Go up one level to get the absolute path to ai-core/
ai_core_dir = os.path.abspath(os.path.join(current_dir, ".."))

# 3. Add ai-core to Python's path so it can find the 'shared' folder
if ai_core_dir not in sys.path:
    sys.path.insert(0, ai_core_dir)

# 4. Now the import will work!
from shared.zone_config import Zone, generate_grid_zones

print("--- Testing Phase 1 Backward Compatibility ---")
# 1. Try to create a Zone EXACTLY how Phase 1 used to do it
try:
    test_zone = Zone(
        zone_id="test_zone_1", polygon=[(0, 0), (0, 10), (10, 10), (10, 0)]
    )
    print("OK: Zone instantiated without error.")
    print(f"   is_exit default: {test_zone.is_exit}")
    print(f"   adjacent_zone_ids default: {test_zone.adjacent_zone_ids}")
except Exception as e:
    print(f"ERROR: Phase 1 instantiation broke! Details: {e}")

print("\n--- Testing Phase 2 Adjacency Logic ---")
# 2. Generate a small grid (e.g., 3x3)
try:
    zones = generate_grid_zones(1920, 1080, 3, 3)

    print(f"OK: Generated {len(zones)} zones.")
    for z in zones:
        print(f"Zone {z.id} is adjacent to: {z.adjacent_zone_ids}")
except Exception as e:
    print(f"ERROR generating grid: {e}")
