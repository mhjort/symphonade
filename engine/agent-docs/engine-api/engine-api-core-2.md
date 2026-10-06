# engine-api-core-2

Auto-generated engine API signature digest — public surface only, bodies omitted.
Format: `Class.method(params): ReturnType`. Regenerated when the engine changes; do not edit.

## engine/ViewPreparation.ts
type ViewPreparer = (camera: THREE.Camera) => void
function registerViewPreparer(preparer: ViewPreparer): () => void

## engine/VoiceInput.ts
type VoiceInputErrorCode = | 'unsupported' // insecure context, no mic API, or no usable backend | 'permission-denied' // the player blocked the microphone | 'no-microphone' // no audio input device present | 'already-listening' | 'not-listening' | 'transcription-failed' // backend/network failure | 'unavailable' // speech-to-text backend not configured (503) | 'rate-limited'
class VoiceInputError extends Error
VoiceInputError.code: VoiceInputErrorCode
VoiceInputError.constructor(code: VoiceInputErrorCode, message: string)
interface VoiceListenOptions — Options for a single listening session.
VoiceListenOptions.language: string | null
VoiceListenOptions.maxDurationMs: number
VoiceListenOptions.timeoutMs: number
const DEFAULT_VOICE_LISTEN_OPTIONS: VoiceListenOptions
type VoiceInputState = 'idle' | 'starting' | 'listening' | 'transcribing'
class VoiceInput
VoiceInput.constructor(aiService: AIService, onMicrophoneReleased?: () => void)
VoiceInput.isSupported(): boolean
VoiceInput.isListening(): boolean
VoiceInput.getState(): VoiceInputState
VoiceInput.onStateChange(callback: (state: VoiceInputState) => void): () => void
VoiceInput.startListening(options?: Partial<VoiceListenOptions>): Promise<void>
VoiceInput.stopListening(): Promise<TranscriptionResult>
VoiceInput.cancelListening(): void
VoiceInput.releaseMicrophone(): void
VoiceInput.dispose(): void

## engine/VsyncFrameCap.ts
const DEFAULT_DISPLAY_PERIOD_MS = 1000 / 60
class VsyncFrameCap
VsyncFrameCap.frameTime(rafTs: number | undefined, nowMs: number): number
VsyncFrameCap.elapsedMs(frameMs: number): number
VsyncFrameCap.admit(frameMs: number, intervalMs: number): boolean
VsyncFrameCap.get displayPeriodMs(): number

## engine/WarmupPolicy.ts
type WarmupMode = 'full' | 'nocompile' | 'culled' | 'light' | 'off'
interface WarmupPolicy — What a mode actually switches on.
WarmupPolicy.compile: boolean
WarmupPolicy.uncullScene: boolean
WarmupPolicy.revealEmptyInstanced: boolean
WarmupPolicy.frame: boolean
function warmupPolicyFor(mode: WarmupMode): WarmupPolicy
function isWarmupMode(value: string): value is WarmupMode
function resolveWarmupMode(fallback: WarmupMode): WarmupMode

## engine/agentUrl.ts
function getAgentUrl(): string

## engine/config.ts
function getWebSocketUrl(port: number): string
function getGameServerUrl(port: number): string
function getGameServerHttpUrl(): string
function getGameServerWsUrl(): string
const GAME_SERVER_WS_URL = getGameServerWsUrl()
const GAME_SERVER_HTTP_URL = getGameServerHttpUrl()
const LID_SENSOR_STREAM_URL = `http://127.0.0.1:${LID_SENSOR_PORT}/stream`
function getAiChatUrl(): string
const AI_CHAT_URL = getAiChatUrl()
const AI_AGENT_URL = getServiceUrl(AI_AGENT_PORT)
const WEBSOCKET_URL = getWebSocketUrl(RELOAD_WATCHER_PORT)
function getGameDataServiceUrl(): string
const GAME_DATA_SERVICE_URL = getGameDataServiceUrl()
const DEFAULT_RENDERER_TYPE: 'webgl' | 'webgpu'
function getApiServerBaseUrl(): string
const API_SERVER_BASE_URL = getApiServerBaseUrl()
function getApiServerToken(): string | null
const API_SERVER_TOKEN = getApiServerToken() ?? ''
function getPlayAuthUrl(): string
const PLAY_AUTH_URL = getPlayAuthUrl()

## engine/gzip.ts
function gzip(input: Uint8Array): Promise<Uint8Array>
function gunzip(input: Uint8Array): Promise<Uint8Array>
function isGzipped(bytes: Uint8Array): boolean
function inflateIfGzipped(buf: ArrayBuffer): Promise<ArrayBuffer>

## engine/hosting.ts
interface EngineHosting — Where the engine's own files come from: the default character rig, the built-in animation
EngineHosting.id: 'bitmagic-cdn' | 'self-hosted'
EngineHosting.characterRig: { primary: string; fallback: string }
EngineHosting.legacyAnimationBaseUrl: string
EngineHosting.generatedAnimationBaseUrl: string
EngineHosting.capturedLocomotionBaseUrl: string
EngineHosting.capturedDirectionalBaseUrl: string
EngineHosting.legacyMeleeClipUrl: string
EngineHosting.animalSkeletonBaseUrl: string
EngineHosting.voxelAnimalBaseUrl: string
EngineHosting.voxelFishBaseUrl: string
EngineHosting.basisTranscoderPath: string | null
const BITMAGIC_CDN_HOSTING: EngineHosting
const SELF_HOSTED_LAYOUT = { characterRig: 'characters/base-character-v2.glb', legacyAn
function selfHostedHosting(root: string): EngineHosting
function githubPagesHosting(siteUrl: string, version: string): EngineHosting
const DEFAULT_HOSTING: EngineHosting
const BITMAGIC_CDN_HOST_ID = 'bitmagic-cdn'
function resolveHosting(meta: string | null, pageUrl: string | null): EngineHosting
const hosting: EngineHosting

## engine/renderSyncPosition.ts
interface RenderSyncPosition — The plain `{x, y, z}` shape shared by a RAPIER `translation()` and a
RenderSyncPosition.x: number
RenderSyncPosition.y: number
RenderSyncPosition.z: number
const RENDER_SYNC_MAX_DIVERGENCE = 2
function resolveRenderSyncPosition(smooth: THREE.Vector3 | null | undefined, body: RenderSyncPosition): RenderSyncPosition

## engine/runtimeBackend.ts
type RuntimeBackendFeature = 'chat' | 'speechToText' | 'imageGeneration' | 'meshGeneration' | 'decisions'
function resolveRuntimeBackendUrl(feature: RuntimeBackendFeature): Promise<string>

## engine/syncGroundWorldSizeToBakedLevel.ts
interface XZBounds — The X/Z footprint of a baked level — the subset of the terrain systems' bounds we need.
XZBounds.minX: number
XZBounds.maxX: number
XZBounds.minZ: number
XZBounds.maxZ: number
function syncGroundWorldSizeToBakedLevel(engine: EngineLike, bounds: XZBounds): void

## engine/version.ts
const ENGINE_VERSION: string
function isReleasedEngineVersion(version: string = ENGINE_VERSION): boolean
