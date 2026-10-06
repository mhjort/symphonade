/**
 * Textures of Game Exchange ads, for the posters and screens a game hangs in
 * its own scene (`engine.gameExchange.loadImageTexture` / `createVideoTexture`).
 *
 * The media lives on the platform's bucket, another origin than a published
 * game's play origin, so it is fetched in CORS mode and handed to three as a
 * blob URL: a blob URL is same-origin and never taints the texture. The fetch
 * bypasses the HTTP cache (`cache: 'reload'`): the engine's own tile loads the
 * same URLs without CORS, and the bucket sends no `Vary`, so a cached copy from
 * the tile can lack the CORS header a texture needs.
 *
 * Images go to three as an HTMLImageElement with the default `flipY`, which
 * both renderers honour the same way (an ImageBitmap does not). The sample art
 * of the preview is an inline SVG and is drawn into a canvas first. Clips are
 * small (the platform caps them well under a megabyte), so they are fetched
 * whole too, and play muted, inline and looping; nothing here ever plays sound.
 */

import * as THREE from 'three';
import {
    GAME_EXCHANGE_WORLD_IMAGE_MAX_WIDTH,
    type GameExchangeImage,
    type GameExchangeImageTextureOptions,
    type GameExchangeVideoTexture,
    type GameExchangeWorldImage,
    type GameExchangeWorldVideo,
} from 'engine/exchange/GameExchangeTypes.js';

/** The width of the `small` copy a poster gets by default: the platform's 384 px copy. */
export const GAME_EXCHANGE_SMALL_IMAGE_WIDTH = 384;

/** A media request that has not finished by then is given up on. */
export const GAME_EXCHANGE_MEDIA_TIMEOUT_MS = 20_000;

/** Anisotropic filtering for posters seen at an angle; the renderer caps it to what the GPU has. */
const POSTER_ANISOTROPY = 8;

/** Everything the helpers take from the page, injectable so tests need no browser. */
export interface GameExchangeTextureDeps {
    fetch: (url: string, init: RequestInit) => Promise<Response>;
    createObjectURL: (blob: Blob) => string;
    revokeObjectURL: (url: string) => void;
    createElement: <K extends 'img' | 'video' | 'canvas'>(tag: K) => HTMLElementTagNameMap[K];
    requestFrame: (callback: () => void) => number;
    cancelFrame: (handle: number) => void;
}

export function defaultGameExchangeTextureDeps(): GameExchangeTextureDeps {
    return {
        fetch: (url, init) => fetch(url, init),
        createObjectURL: (blob) => URL.createObjectURL(blob),
        revokeObjectURL: (url) => URL.revokeObjectURL(url),
        createElement: (tag) => document.createElement(tag),
        requestFrame: (callback) => requestAnimationFrame(callback),
        cancelFrame: (handle) => cancelAnimationFrame(handle),
    };
}

/**
 * The copy of `image` a texture of `size` is made from, or null when it has
 * no copy at most GAME_EXCHANGE_WORLD_IMAGE_MAX_WIDTH wide (the full cover is
 * never used for a texture). `small`: the widest copy up to
 * GAME_EXCHANGE_SMALL_IMAGE_WIDTH, else the narrowest; `large`: the widest.
 * Its height keeps the image's aspect.
 */
export function pickGameExchangeTextureImage(
    image: GameExchangeImage,
    size: GameExchangeImageTextureOptions['size'],
): GameExchangeWorldImage | null {
    const copies = [...image.sources, { url: image.url, width: image.width }]
        .filter((copy) => copy.width <= GAME_EXCHANGE_WORLD_IMAGE_MAX_WIDTH)
        .sort((a, b) => a.width - b.width);
    const upToSmall = copies.filter((copy) => copy.width <= GAME_EXCHANGE_SMALL_IMAGE_WIDTH);
    const pick = size === 'large' ? copies[copies.length - 1] : (upToSmall[upToSmall.length - 1] ?? copies[0]);
    if (!pick) return null;
    const width = Math.round(pick.width);
    return { url: pick.url, width, height: Math.max(1, Math.round((width * image.height) / image.width)) };
}

/** Fetch `url` in CORS mode, bypassing the HTTP cache, and return a blob URL for it. Rejects on any failure. */
async function fetchObjectUrl(url: string, deps: GameExchangeTextureDeps): Promise<string> {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), GAME_EXCHANGE_MEDIA_TIMEOUT_MS);
    try {
        const res = await deps.fetch(url, {
            mode: 'cors',
            credentials: 'omit',
            cache: 'reload',
            ...(controller ? { signal: controller.signal } : {}),
        });
        if (!res.ok) throw new Error(`Game Exchange media answered ${res.status}`);
        return deps.createObjectURL(await res.blob());
    } finally {
        clearTimeout(timer);
    }
}

function loadImageElement(url: string, deps: GameExchangeTextureDeps): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = deps.createElement('img');
        // Before src: the element must make a CORS request (a blob or data URL is same-origin anyway).
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Game Exchange image did not load'));
        img.src = url;
    });
}

function setUpStill(texture: THREE.Texture, name: string): THREE.Texture {
    texture.name = name;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = POSTER_ANISOTROPY;
    texture.needsUpdate = true;
    return texture;
}

/**
 * A texture of one still. `https:` URLs are fetched as described in the file
 * header; a `data:` URL (the preview's inline SVG) is drawn into a canvas, as
 * an SVG has no reliable size of its own for a GPU upload.
 */
export async function loadGameExchangeImageTexture(image: GameExchangeWorldImage, name: string, deps: GameExchangeTextureDeps): Promise<THREE.Texture> {
    if (image.url.startsWith('data:')) {
        const img = await loadImageElement(image.url, deps);
        const canvas = deps.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Game Exchange image could not be drawn');
        context.drawImage(img, 0, 0, image.width, image.height);
        return setUpStill(new THREE.CanvasTexture(canvas), name);
    }
    const objectUrl = await fetchObjectUrl(image.url, deps);
    try {
        // A loaded image keeps its pixels after its blob URL is revoked.
        return setUpStill(new THREE.Texture(await loadImageElement(objectUrl, deps)), name);
    } finally {
        deps.revokeObjectURL(objectUrl);
    }
}

/**
 * A muted, looping clip on a VideoTexture. The clip is fetched at once and
 * plays on `play()`. `onDispose` runs once, when the texture is disposed.
 */
export function createGameExchangeVideoTexture(
    video: GameExchangeWorldVideo,
    name: string,
    deps: GameExchangeTextureDeps,
    onDispose: (handle: GameExchangeVideoTexture) => void,
): GameExchangeVideoTexture {
    const el = deps.createElement('video');
    el.crossOrigin = 'anonymous';
    // Muted inline playback is what browsers allow without a gesture; iOS reads
    // the attributes, so they are set as well as the properties.
    el.muted = true;
    el.defaultMuted = true;
    el.setAttribute('muted', '');
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    el.loop = true;
    el.preload = 'auto';
    el.disablePictureInPicture = true;
    // Never with sound, whoever reaches the element through `texture.image`.
    el.addEventListener('volumechange', () => {
        if (!el.muted) el.muted = true;
    });

    const texture = new THREE.VideoTexture(el);
    texture.name = name;
    texture.colorSpace = THREE.SRGBColorSpace;

    let disposed = false;
    let objectUrl: string | null = null;
    const loaded = fetchObjectUrl(video.url, deps).then((url) => {
        if (disposed) {
            deps.revokeObjectURL(url);
            throw new Error('Game Exchange video texture was disposed');
        }
        objectUrl = url;
        el.src = url;
    });
    // A failed load surfaces through play(); unobserved, it must not be reported as unhandled.
    loaded.catch(() => undefined);

    // three's VideoTexture asks for each new frame with requestVideoFrameCallback.
    // Where a browser lacks it, the WebGPU renderer never asks at all, so a frame
    // loop marks the texture while the clip plays.
    const needsFrameLoop = !('requestVideoFrameCallback' in el);
    let frame: number | null = null;
    const stopFrames = (): void => {
        if (frame === null) return;
        deps.cancelFrame(frame);
        frame = null;
    };
    const tick = (): void => {
        frame = null;
        if (disposed || el.paused) return;
        if (el.readyState >= el.HAVE_CURRENT_DATA) texture.needsUpdate = true;
        frame = deps.requestFrame(tick);
    };

    const handle: GameExchangeVideoTexture = {
        texture,
        async play(): Promise<void> {
            if (disposed) throw new Error('Game Exchange video texture was disposed');
            await loaded;
            if (disposed) throw new Error('Game Exchange video texture was disposed');
            el.muted = true;
            await el.play();
            if (needsFrameLoop && frame === null && !disposed) frame = deps.requestFrame(tick);
        },
        pause(): void {
            stopFrames();
            if (!disposed) el.pause();
        },
        dispose(): void {
            if (disposed) return;
            disposed = true;
            stopFrames();
            el.pause();
            el.removeAttribute('src');
            el.load();
            texture.dispose();
            if (objectUrl) deps.revokeObjectURL(objectUrl);
            objectUrl = null;
            onDispose(handle);
        },
    };
    return handle;
}
