"""Number the existing cabin stations from aft to forward; retain room geometry.

python3 src/work/art/renumber_deck8_cabins.py
Also called by complete_deck8_cabins.py when rebuilding the original templates.
"""
import json
import re
from pathlib import Path

def renumber(level, doors, placements):
    cabins = sorted((d for d in doors if d.get('keyId', '').startswith('room-')),
                    key=lambda d: (d['position']['z'], d['position']['x']))
    assert len(cabins) == 18
    mapping = {d['id']: str(8401 + i) for i, d in enumerate(cabins)}
    if all(old == new for old, new in mapping.items()): return level
    names = {}
    for old, new in mapping.items():
        old_name = {'8401': 'Promenade cabin', '8402': 'Sea view cabin'}.get(old, 'Cabin ' + old)
        new_name = {'8401': 'Promenade cabin', '8402': 'Sea view cabin'}.get(new, 'Cabin ' + new)
        names[old_name] = new_name
    # A single replacement pass prevents number/name swaps cascading.
    replacements = {**mapping, **names}
    pattern = re.compile('|'.join(re.escape(key) for key in sorted(replacements, key=len, reverse=True)))
    def rewrite(value):
        if isinstance(value, str): return pattern.sub(lambda m: replacements[m.group()], value)
        if isinstance(value, list): return [rewrite(v) for v in value]
        if isinstance(value, dict): return {rewrite(k): rewrite(v) for k, v in value.items()}
        return value
    for door in cabins:
        door['id'] = mapping[door['id']]
        door['keyId'] = 'room-' + door['id']
        door['assetId'] = 'cabin-door-shared'
    for cabin in placements: cabin['id'] = mapping[cabin['id']]
    return rewrite(level)

if __name__ == '__main__':
    root = Path(__file__).resolve().parents[3]
    path = root / 'src/work'
    world = json.loads((path / 'world.json').read_text())
    level = json.loads((path / 'serenade.mesh-level.json').read_text())
    placements = json.loads((path / 'deck8-cabins.json').read_text())
    level = renumber(level, world['worldProfileData']['doors'], placements)
    for name, data in [('world.json', world), ('serenade.mesh-level.json', level), ('deck8-cabins.json', placements)]:
        (path / name).write_text(json.dumps(data, indent=2) + '\n')
