# 2D physics (voxel genre, Rapier 2D)

A 2D game is a **Voxel** game whose `game.json` declares BOTH fields:

```json
{
  "gameGenre": "Voxel",
  "physicsMode": "2d",
  "physics2d": true
}
```

`physicsMode: "2d"` alone does nothing — without `physics2d: true` (the template's statement
that its code targets the 2D world) the engine boots 3D physics. The sidescroller and top-down
templates ship both. There is no separate 2D genre: rendering, voxel terrain, placed objects,
block characters, NPCs and the HUD are the ordinary voxel ones. Only collision, queries and
triggers move to Rapier 2D (`@dimforge/rapier2d-compat`), and a published bundle ships only that
flavour.

## Which plane

| Camera | Plane | 2D (x, y) is world… | Off-plane axis |
|---|---|---|---|
| any but top-down (the sidescroller) | side-on | X, Y | Z, locked to `engine.getGameplayPlaneZ()` |
| `cameraMode: 'top-down'` (the top-down template) | ground plane | X, Z | Y, virtual — follows the terrain height |

## Write the ordinary 3D code

`engine.physicsWorld` on this lane is a **plane-locked facade**: it takes the 3D calls
(`translation()`, `setNextKinematicTranslation()`, `raycast()`, the character controller) and
forwards them to the 2D world with the off-plane axis projected away. So:

- Use the normal player, NPC, collectible, placed-object and weapon APIs. `Projectile.ts`,
  `ShootableComponent` and `installRangedWeapon` fly in the plane (see `combat-system.md`).
- Never import `@dimforge/rapier3d-compat` values (`RAPIER.RigidBodyDesc`, `new RAPIER.Ray`) in
  game code — the 3D package is a `null` stub in a 2D bundle and throws at call time.
- For rays only, `queryPhysicsFor(engine)` (`engine/physics/PlaneLockedPhysics.js`) returns
  whichever world takes queries. `isPlaneLockedPhysics(engine.physicsWorld)` tells you which lane
  you are on.
- `engine.physicsWorld2D` is the raw 2D world, for 2D-native bodies only.

## 3D-only — skip or replace

`KinematicPlatform`, `CrumblingPlatform`, doors and their key pickups, vehicles, water, GLB
trimesh/dynamic colliders, ragdolls and voxel carving do not run on this lane. The engine skips
them where it reaches them; game code that constructs them directly gets a named facade error.
Gate such code on `isPlaneLockedPhysics(engine.physicsWorld)`, or build the mechanic from
sensors and static/dynamic bodies, which both planes support.

## Levels

A side-view game's level comes from the World-Forger's side-on path — see
`sideon-forged-levels.md`. A top-down 2D-physics game uses the ordinary 3D forge with flat
terrain: an unclimbable rise collides as a one-way cliff wall, so height comes from placed
objects, not terrain relief.

Engine internals (the facade, terrain bridges, one-flavour bundles): `game/docs/physics-2d-lane.md`.
