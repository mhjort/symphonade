"""Photo-inspired cabin leaf; Blender -b --python this_file -- 8402."""
import bpy, math, os, sys
number = sys.argv[sys.argv.index('--') + 1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
def material(name, color, metal=0, rough=.4):
    m = bpy.data.materials.new(name); m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    return m
blue = material('Painted blue gray steel', (.25,.36,.41), .25)
edge = material('Blue edge trim', (.16,.25,.30), .5)
brass = material('Satin brass', (.55,.40,.17), .8, .25)
black = material('Reader slot', (.016,.024,.028))
ivory = material('Oval enamel', (.57,.61,.51), .2)
def box(name, pos, size, mat, bevel=0):
    # Game x,y,z -> Blender x,-z,y.
    bpy.ops.mesh.primitive_cube_add(size=1, location=(pos[0],-pos[2],pos[1]))
    o=bpy.context.object; o.name=name; o.dimensions=(size[0],size[2],size[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat)
    if bevel:
        mod=o.modifiers.new('Soft machined edges','BEVEL'); mod.width=bevel; mod.segments=3
        o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return o
box('Steel leaf',(0,1.1,0),(1.1,2.2,.07),blue,.015)
for x in [-.525,.525]: box('Edge molding',(x,1.1,.039),(.025,2.16,.016),edge,.006)
for y in [.055,2.145]: box('Edge molding',(0,y,.039),(1.04,.025,.016),edge,.006)
for y in [.25,.43,.61,.79,.97,1.15,1.95]:
    box('Pressed horizontal flute',(0,y,.036),(.9,.012,.009),edge,.004)
    box('Flute highlight',(0,y+.014,.038),(.9,.008,.008),blue,.003)
def oval(name,w,h,z,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=16,location=(0,-z,1.68))
    o=bpy.context.object; o.name=name; o.scale=(w/2,.009,h/2); o.data.materials.append(mat)
oval('Brass oval rim',.27,.42,.047,brass)
oval('Enamel cabin plaque',.238,.388,.057,ivory)
bpy.ops.object.text_add(location=(0,-.068,1.68),rotation=(math.pi/2,0,0))
o=bpy.context.object; o.name='Cabin number'; o.data.body=number
o.data.align_x='CENTER'; o.data.align_y='CENTER'; o.data.size=.071; o.data.extrude=.0005; o.data.materials.append(black)
for side in [-1,1]:
    box('Brass lock escutcheon',(.405,1.01,side*.052),(.115,.36,.034),brass,.013)
    box('Lever spindle',(.405,.97,side*.089),(.042,.042,.06),brass,.01)
    box('Brass lever',(.335,.97,side*.12),(.18,.036,.035),brass,.015)
box('Keycard slot in handle assembly',(.405,1.125,.071),(.078,.013,.007),black,.002)
box('Reader indicator bezel',(.405,1.175,.071),(.028,.018,.008),black,.003)
os.makedirs('build/level',exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(f'build/level/cabin-door-{number}.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.abspath(f'build/level/cabin-door-{number}.glb'),export_format='GLB')
