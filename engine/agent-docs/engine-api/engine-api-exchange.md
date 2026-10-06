# engine-api-exchange

Auto-generated engine API signature digest — public surface only, bodies omitted.
Format: `Class.method(params): ReturnType`. Regenerated when the engine changes; do not edit.

## engine/exchange/GameExchangeCard.ts
const GAME_EXCHANGE_HOST_CLASS = 'gx-host'
function injectGameExchangeStyles(): void
interface GameExchangeCardEnv — What the tile needs to know about the page it is drawn in.
GameExchangeCardEnv.framed: boolean
GameExchangeCardEnv.reducedMotion: boolean
GameExchangeCardEnv.saveData: boolean
GameExchangeCardEnv.compact: boolean
function isFramedWindow(): boolean
function readGameExchangeCardEnv(): GameExchangeCardEnv
interface GameExchangeCardOptions
GameExchangeCardOptions.onImpression: (slot: GameExchangeSlot) => void
GameExchangeCardOptions.env: GameExchangeCardEnv
interface GameExchangeCard
GameExchangeCard.readonly element: HTMLElement
GameExchangeCard.start(): void
GameExchangeCard.dispose(): void
function resolveTileTarget(openIn: 'auto' | 'new' | 'same', framed: boolean): '_blank' | '_top' | null
function tileAriaLabel(disclosure: string, title: string, cta: string, newTab: boolean): string
function createGameExchangeCard(slot: GameExchangeSlot, options: GameExchangeCardOptions): GameExchangeCard

## engine/exchange/GameExchangeClient.ts
const GAME_EXCHANGE_SERVE_PATH = '/api/play/exchange/serve'
const GAME_EXCHANGE_IMPRESSION_PATH = '/api/play/exchange/impression'
const GAME_EXCHANGE_CLICK_PATH = '/api/play/exchange/click'
const GAME_EXCHANGE_REQUEST_TIMEOUT_MS = 4_000
const GAME_EXCHANGE_REFRESH_AT = 0.7
const GAME_EXCHANGE_SEEN_KEY = 'bm-gx-seen'
const GAME_EXCHANGE_SEEN_MAX = 5
function httpsUrl(value: unknown): string | null
function parseGameExchangeAd(raw: unknown, baseUrl: string): GameExchangeAd | null
function parseGameExchangeAds(raw: readonly unknown[], baseUrl: string): GameExchangeAd[]
type GameExchangeServeResult = | { enabled: false } | { enabled: true; minViewMs: number; armMs: number; expiresInMs: number; /** The first valid ad: the tile of a one-tile placement. */ ad: GameExchangeAd | null; ads: GameExchangeAd[]; }
function parseGameExchangeServeResponse(raw: unknown, baseUrl: string): GameExchangeServeResult | null
type GameExchangeStorage = Pick<Storage, 'getItem' | 'setItem'>
function readSeenGameIds(storage: GameExchangeStorage | null): string[]
function rememberSeenGameId(storage: GameExchangeStorage | null, gameId: string): void
interface GameExchangeClientDeps
GameExchangeClientDeps.baseUrl: string
GameExchangeClientDeps.fetch: (url: string, init: RequestInit) => Promise<Response>
GameExchangeClientDeps.getDevice: () => GameExchangeDevice
GameExchangeClientDeps.getStorage: () => GameExchangeStorage | null
GameExchangeClientDeps.engineVersion: string | null
interface GameExchangeAdBatch — The ads one `requestAds()` brought, with the terms the serve answer set for them.
GameExchangeAdBatch.ads: GameExchangeAd[]
GameExchangeAdBatch.minViewMs: number
GameExchangeAdBatch.armMs: number
GameExchangeAdBatch.expiresInMs: number
function clampGameExchangeAdCount(count: unknown): number
class GameExchangeClient — One instance per engine, bound to a game by `configure()` on every load.
GameExchangeClient.constructor(private readonly deps: GameExchangeClientDeps)
GameExchangeClient.configure(gameId: string, formats: readonly GameExchangeFormat[]): void
GameExchangeClient.stop(): void
GameExchangeClient.request(placement: GameExchangePlacement): void
GameExchangeClient.getSlot(placement: GameExchangePlacement): GameExchangeSlot | null
GameExchangeClient.onSlot(placement: GameExchangePlacement, listener: () => void): () => void
GameExchangeClient.markShown(slot: GameExchangeSlot): void
GameExchangeClient.reportImpression(slot: GameExchangeSlot): void
GameExchangeClient.requestAds(count: number, formats: readonly GameExchangeFormat[]): Promise<GameExchangeAdBatch | null>

## engine/exchange/GameExchangeGate.ts
interface GameExchangeGateInputs
GameExchangeGateInputs.config: { enabled?: unknown } | null | undefined
GameExchangeGateInputs.playtest: boolean
GameExchangeGateInputs.packaged: boolean
GameExchangeGateInputs.pokiSdk: boolean
GameExchangeGateInputs.webdriver: boolean
GameExchangeGateInputs.creatorMode: boolean
GameExchangeGateInputs.environment: Environment
GameExchangeGateInputs.bitmagicHost: boolean
GameExchangeGateInputs.hasGameIdMeta: boolean
function resolveGameExchangeMode(inputs: GameExchangeGateInputs): GameExchangeMode
interface GameExchangeRecordingInputs
GameExchangeRecordingInputs.eventLogOwner: EventLogOwner | null
GameExchangeRecordingInputs.recordingFrames: boolean
function gameExchangeModeAtRender(mode: GameExchangeMode, recording: GameExchangeRecordingInputs): GameExchangeMode
function readGameExchangeGateInputs(config: GameExchangeGateInputs['config']): GameExchangeGateInputs

## engine/exchange/GameExchangePopup.ts
const GAME_EXCHANGE_POPUP_ID = 'engine-exchange-popup'
const GAME_EXCHANGE_POPUP_CLASS = 'gx-popup'
interface GameExchangePopupHost — What the popup needs from the engine while it is open.
GameExchangePopupHost.hud: IGameHUD
GameExchangePopupHost.isPlaying(): boolean
GameExchangePopupHost.enterInteractiveUI(): void
GameExchangePopupHost.exitInteractiveUI(): void
class GameExchangePopup
GameExchangePopup.guardKeys(target: Window): void
GameExchangePopup.show(tile: GameExchangeCard, host: GameExchangePopupHost): boolean
GameExchangePopup.close(animate = true): void

## engine/exchange/GameExchangeTextures.ts
const GAME_EXCHANGE_SMALL_IMAGE_WIDTH = 384
const GAME_EXCHANGE_MEDIA_TIMEOUT_MS = 20_000
interface GameExchangeTextureDeps — Everything the helpers take from the page, injectable so tests need no browser.
GameExchangeTextureDeps.fetch: (url: string, init: RequestInit) => Promise<Response>
GameExchangeTextureDeps.createObjectURL: (blob: Blob) => string
GameExchangeTextureDeps.revokeObjectURL: (url: string) => void
GameExchangeTextureDeps.createElement: <K extends 'img' | 'video' | 'canvas'>(tag: K) => HTMLElementTagNameMap[K]
GameExchangeTextureDeps.requestFrame: (callback: () => void) => number
GameExchangeTextureDeps.cancelFrame: (handle: number) => void
function defaultGameExchangeTextureDeps(): GameExchangeTextureDeps
function pickGameExchangeTextureImage(image: GameExchangeImage, size: GameExchangeImageTextureOptions['size']): GameExchangeWorldImage | null
function loadGameExchangeImageTexture(image: GameExchangeWorldImage, name: string, deps: GameExchangeTextureDeps): Promise<THREE.Texture>
function createGameExchangeVideoTexture(video: GameExchangeWorldVideo, name: string, deps: GameExchangeTextureDeps, onDispose: (handle: GameExchangeVideoTexture) => void): GameExchangeVideoTexture

## engine/exchange/GameExchangeTypes.ts
const GAME_EXCHANGE_CARD_REV = 1
const GAME_EXCHANGE_WIRE_VERSION = 1
const GAME_EXCHANGE_STYLE_ID = 'bm-game-exchange-styles'
type GameExchangePlacement = 'end' | 'pause' | 'custom' | 'world'
type GameExchangeFormat = 'banner' | 'video'
type GameExchangeConfig = NonNullable<WorldProfileData['gameExchange']>
type GameExchangeMode = 'off' | 'preview' | 'live'
interface GameExchangeImageSource
GameExchangeImageSource.url: string
GameExchangeImageSource.width: number
interface GameExchangeImage
GameExchangeImage.url: string
GameExchangeImage.width: number
GameExchangeImage.height: number
GameExchangeImage.sources: GameExchangeImageSource[]
GameExchangeImage.focus?: { x0: number; y0: number; x1: number; y1: number }
interface GameExchangeVideo
GameExchangeVideo.url: string
GameExchangeVideo.width: number
GameExchangeVideo.height: number
GameExchangeVideo.durationMs: number
interface GameExchangeAd — One tile, as the server describes it.
GameExchangeAd.token: string
GameExchangeAd.kind: 'exchange' | 'house'
GameExchangeAd.gameId: string
GameExchangeAd.title: string
GameExchangeAd.tagline?: string
GameExchangeAd.banner: GameExchangeImage
GameExchangeAd.square?: GameExchangeImage
GameExchangeAd.video?: GameExchangeVideo
GameExchangeAd.worldVideo?: GameExchangeVideo
GameExchangeAd.clickUrl: string
GameExchangeAd.label: string
GameExchangeAd.cta: string
GameExchangeAd.disclosure: string
GameExchangeAd.openIn: 'auto' | 'new' | 'same'
GameExchangeAd.videoLoops: number
interface GameExchangeDevice
GameExchangeDevice.mobile: boolean
GameExchangeDevice.width: number
GameExchangeDevice.height: number
GameExchangeDevice.framed: boolean
interface GameExchangeSlot — The current tile of one placement. One object per placement per load: a
GameExchangeSlot.ad: GameExchangeAd
GameExchangeSlot.preview: boolean
GameExchangeSlot.minViewMs: number
GameExchangeSlot.armMs: number
GameExchangeSlot.staleAt: number
GameExchangeSlot.visibleMs: number
GameExchangeSlot.countedUntil: number
GameExchangeSlot.impressionSent: boolean
interface GameExchangeMountOptions
GameExchangeMountOptions.placement: 'custom'
const DEFAULT_GAME_EXCHANGE_MOUNT_OPTIONS: GameExchangeMountOptions
interface GameExchangeMountHandle
GameExchangeMountHandle.dispose(): void
const GAME_EXCHANGE_MAX_ADS = 6
interface GameExchangeAdsOptions — What `engine.gameExchange.getAds()` asks for.
GameExchangeAdsOptions.count: number
GameExchangeAdsOptions.formats: GameExchangeFormat[]
const DEFAULT_GAME_EXCHANGE_ADS_OPTIONS: GameExchangeAdsOptions
const GAME_EXCHANGE_WORLD_IMAGE_MAX_WIDTH = 768
interface GameExchangeWorldImage — One picture of an ad, sized for a texture.
GameExchangeWorldImage.readonly url: string
GameExchangeWorldImage.readonly width: number
GameExchangeWorldImage.readonly height: number
interface GameExchangeWorldVideo
GameExchangeWorldVideo.readonly durationMs: number
interface GameExchangeWorldAd — An ad for the game's own scene: its pictures, to put on a poster or a TV,
GameExchangeWorldAd.readonly gameId: string
GameExchangeWorldAd.readonly title: string
GameExchangeWorldAd.readonly disclosure: string
GameExchangeWorldAd.readonly image: GameExchangeWorldImage
GameExchangeWorldAd.readonly square?: GameExchangeWorldImage
GameExchangeWorldAd.readonly video?: GameExchangeWorldVideo
GameExchangeWorldAd.readonly expiresAt: number
GameExchangeWorldAd.open(): void
interface GameExchangeImageTextureOptions — What `loadImageTexture()` loads.
GameExchangeImageTextureOptions.picture: 'image' | 'square'
GameExchangeImageTextureOptions.size: 'small' | 'large'
const DEFAULT_GAME_EXCHANGE_IMAGE_TEXTURE_OPTIONS: GameExchangeImageTextureOptions
interface GameExchangeVideoTexture — An ad's clip as a texture, from `createVideoTexture()`. Always muted, always looping.
GameExchangeVideoTexture.readonly texture: VideoTexture
GameExchangeVideoTexture.play(): Promise<void>
GameExchangeVideoTexture.pause(): void
GameExchangeVideoTexture.dispose(): void
interface GameExchangeApi — `engine.gameExchange`.
GameExchangeApi.isAvailable(): boolean
GameExchangeApi.mount(container: HTMLElement, options?: Partial<GameExchangeMountOptions>): GameExchangeMountHandle | null
GameExchangeApi.getAds(options?: Partial<GameExchangeAdsOptions>): Promise<GameExchangeWorldAd[]>
GameExchangeApi.loadImageTexture(ad: GameExchangeWorldAd, options?: Partial<GameExchangeImageTextureOptions>): Promise<Texture>
GameExchangeApi.createVideoTexture(ad: GameExchangeWorldAd): GameExchangeVideoTexture | null

## engine/exchange/installGameExchange.ts
type GameExchangeScreenPlacement = 'end' | 'pause'
interface GameExchangeEngine — What the subsystem needs from the engine that loaded the game.
GameExchangeEngine.gameStateManager?: GameStateManager
GameExchangeEngine.genreModule: { hud?: IGameHUD } | null
GameExchangeEngine.isRecordingFrames(): boolean
GameExchangeEngine.enterInteractiveUI(): void
GameExchangeEngine.exitInteractiveUI(): void
interface GameExchangeInstallDeps — Everything the subsystem reads from the page, injectable so tests need no browser.
GameExchangeInstallDeps.client: GameExchangeClientDeps
GameExchangeInstallDeps.readGateInputs: (config: GameExchangeConfig | undefined) => GameExchangeGateInputs
GameExchangeInstallDeps.readCardEnv: () => GameExchangeCardEnv
GameExchangeInstallDeps.textures: GameExchangeTextureDeps
function getGameExchange(): GameExchangeApi
