import json

old_data = json.load(open('ai_core/risk_engine/tests/sample_data/phase2_output.json'))
new_data = json.load(open('phase2_output_v2.json'))

print("=== 1. FRAME-BY-FRAME MAX ZONE RISK SCORE COMPARISON ===")
print(f"{'Frame':<6} | {'Old Max Zone':<12} | {'Old Max Risk':<12} | {'New Max Zone':<12} | {'New Max Risk':<12} | {'Diff':<8}")
print("-" * 75)

for i in range(min(len(old_data), len(new_data))):
    old_zones = old_data[i]['zones']
    new_zones = new_data[i]['zones']
    old_max = max(old_zones, key=lambda z: z['risk_score'])
    new_max = max(new_zones, key=lambda z: z['risk_score'])
    diff = new_max['risk_score'] - old_max['risk_score']
    print(f"{i:<6} | {old_max['zone_id']:<12} | {old_max['risk_score']:<12.4f} | {new_max['zone_id']:<12} | {new_max['risk_score']:<12.4f} | {diff:<+8.4f}")

print("\n=== 2. HIGHEST-RISK FRAME/ZONE IN NEW OUTPUT ===")
all_new_zones = []
for i, f in enumerate(new_data):
    for z in f['zones']:
        all_new_zones.append((i, z))

highest_new_frame, highest_new_zone = max(all_new_zones, key=lambda x: x[1]['risk_score'])
zone_id = highest_new_zone['zone_id']
print(f"Highest-risk frame: Frame {highest_new_frame}, Zone: {zone_id}, New Risk Score: {highest_new_zone['risk_score']:.4f}")

# Find matching old zone
old_matching_zone = None
for z in old_data[highest_new_frame]['zones']:
    if z['zone_id'] == zone_id:
        old_matching_zone = z
        break

print("\nFull Contributing Factors Comparison for Highest-Risk Zone:")
print("NEW:", json.dumps(highest_new_zone['contributing_factors'], indent=2))
if old_matching_zone:
    print("OLD:", json.dumps(old_matching_zone['contributing_factors'], indent=2))

print("\n=== 3. RISK LEVEL ELEVATIONS (LOW -> MODERATE OR HIGHER) ===")
elevated = []
for i in range(min(len(old_data), len(new_data))):
    old_lookup = {z['zone_id']: z for z in old_data[i]['zones']}
    new_lookup = {z['zone_id']: z for z in new_data[i]['zones']}
    for zid, nz in new_lookup.items():
        oz = old_lookup.get(zid)
        old_lvl = oz['risk_level'] if oz else 'unknown'
        new_lvl = nz['risk_level']
        if old_lvl == 'low' and new_lvl != 'low':
            elevated.append((i, zid, oz['risk_score'], nz['risk_score'], old_lvl, new_lvl))
        elif nz['risk_score'] >= 0.3:
            elevated.append((i, zid, oz['risk_score'] if oz else 0, nz['risk_score'], old_lvl, new_lvl))

if elevated:
    print(f"Found {len(elevated)} zone instances reaching 'moderate' or higher risk level:")
    for item in elevated:
        print(f"Frame {item[0]}, Zone {item[1]}: Old={item[2]:.4f} ({item[4]}), New={item[3]:.4f} ({item[5]})")
else:
    print("No zones reached moderate or higher risk level across all frames.")

print("\nCheck all max flow_convergence_scores across frames:")
for i in range(min(len(old_data), len(new_data))):
    old_max_fc = max(z['contributing_factors']['flow_convergence_score'] for z in old_data[i]['zones'])
    new_max_fc = max(z['contributing_factors']['flow_convergence_score'] for z in new_data[i]['zones'])
    print(f"Frame {i:2d}: Old Max Flow Convergence={old_max_fc:.4f}, New Max Flow Convergence={new_max_fc:.4f}")
