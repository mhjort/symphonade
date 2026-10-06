"""Remove redundant 8401/8402 signs; all 18 numbers now ride shared door leaves."""
import sys
from pathlib import Path
import bpy

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root / 'tools/level'))
from export_ship_modules import export_current
assembly = root / 'build/level/modules/assembly.blend'
bpy.ops.wm.open_mainfile(filepath=str(assembly))
for obj in list(bpy.context.scene.objects):
    if obj.name in {f'{room} {label}' for room in ['Promenade cabin', 'Sea view cabin']
                   for label in ['plaque', 'corridor plaque']}:
        bpy.data.objects.remove(obj, do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath=str(assembly))
export_current('base')
