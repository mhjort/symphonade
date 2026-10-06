# Exterior restoration

`restore_ship_exterior.py` restores the imported Silja Serenade shell from
`build/ship/source/SiljaSerenade.glb`, subtracting only the tightly bounded boarding
entrance. Passenger rooms and the skylight must not cut the source shell: those
cuts damage the funnel and upper decks. Run it
after any legacy full rebuild that reintroduces those cuts. Review the staged
`build/level/exterior-restored.blend`, then run it with `-- --export` to update the
assembly and its base GLB. Collision data and other venue modules are unchanged.

`ShipAssembly.updateExteriorVisibility` hides the original display-model shell
for cameras inside passenger rooms. This preserves sea views from the authored
interiors, whose locations differ from the original model's decks. Exterior
cameras and the terminal gangway retain the full shell. The ship-exterior browser
test covers both modes, independent cameras, desktop, and mobile.

## Hosted registration

The restored base, twin stairs and open deck 8 access are registered as hosted
assets. The base registration succeeded on September 14 after the earlier
entitlement refusal. `open_stair_access.py` runs after `twin_lift_stairs.py` and
updates both the base and Starlight modules; register both GLBs after exporting.
Use each module report's native height and preserve the existing asset IDs.

After stair/entrance edits, run `stair_surface_cleanup.py` to trim coplanar
landing faces and close the rail ends. Review its stage, then export/register
only the base module. It preserves the shared collision sidecar.

Run `shop_surface_cleanup.py` after assembly repairs to trim shared render faces
beneath the Fashion, Desigual and Marimekko floors. Review the stage, then export
and register only base; shop modules and collision metadata stay intact.

`restaurant_surface_cleanup.py` audits and trims floor/doorframe overlaps within
all dining/bar entrance bounds. Review its stage and audit the unchanged sidecar,
then export and register the modules listed in `restaurant-surface-modules.json`.
It preserves UVs, winding and physics.
