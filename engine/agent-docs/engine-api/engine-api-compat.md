# engine-api-compat

Auto-generated engine API signature digest — public surface only, bodies omitted.
Format: `Class.method(params): ReturnType`. Regenerated when the engine changes; do not edit.

## engine/compat/deprecate.ts
function deprecate(key: string): void

## engine/compat/registry.ts
type DeprecationRemoval = 'next-release' | 'first-semver-major'
interface Deprecation
Deprecation.key: string
Deprecation.removeIn: DeprecationRemoval
Deprecation.note: string
const DEPRECATIONS: readonly Deprecation[]
