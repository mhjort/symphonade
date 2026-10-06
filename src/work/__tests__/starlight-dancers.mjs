import { startVoyage } from './start-voyage.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const { gamePort } = JSON.parse(await fs.readFile('.bitmagic/dev.json', 'utf8'));
await fs.mkdir('.bitmagic/dance', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] });
try { for (const mobile of [false, true]) {
    const page = await browser.newPage(mobile ? { ...devices['iPhone 14'] } : { viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://localhost:${gamePort}/`);
    await page.waitForFunction(() => window.gameTemplate?.getGameEngine()?.genreModule?.slotMachine?.body, null, { timeout: 90000 });
    await startVoyage(page);
    await page.evaluate(() => {
        const p = window.gameTemplate.getGameEngine().getPlayerController();
        p.teleportTo(0, .1, 43);
        p.cameraController.setHorizontalAngle(Math.PI);
        p.cameraController.setVerticalAngle(0);
    });
    await page.waitForFunction(() => window.gameTemplate.getGameEngine().genreModule.starlightDancers?.npcs.length === 2);
    await page.waitForTimeout(1500);
    const sample = () => page.evaluate(() => {
        const g = window.gameTemplate.getGameEngine().genreModule;
        return g.starlightDancers.npcs.map(n => {
            const bones = [];
            const character = n.getCharacter(), vertex = character.position.clone();
            let soleY = Infinity;
            character.updateWorldMatrix(true, true);
            character.traverse(o => {
                if (o.isBone) bones.push(...o.quaternion.toArray());
                if (o.isSkinnedMesh) {
                    o.skeleton.update();
                    for (let i = 0; i < o.geometry.attributes.position.count; i++) {
                        o.getVertexPosition(i, vertex).applyMatrix4(o.matrixWorld);
                        soleY = Math.min(soleY, vertex.y);
                    }
                }
            });
            return { dancing: n.getAnimationController().getIsPlayingCustomAnimation(),
                skinned: n.isRenderingSkinnedMesh(), position: n.getCharacter().position.toArray(),
                interactive: n.interactionEnabled(), bones, soleY };
        });
    });
    const before = await sample();
    assert.equal(before.length, 2);
    for (const n of before) {
        assert.equal(n.dancing, true);
        assert.equal(n.skinned, true);
        assert.equal(n.interactive, false);
        assert.ok(n.bones.length > 20);
    }
    await page.screenshot({ path: `.bitmagic/dance/npcs-${mobile ? 'mobile' : 'desktop'}.png` });
    await page.waitForTimeout(650);
    const after = await sample();
    for (let i = 0; i < 2; i++) {
        assert.notDeepEqual(after[i].bones, before[i].bones, 'Real skeletal dance motion');
        assert.ok(Math.hypot(after[i].position[0] - before[i].position[0], after[i].position[2] - before[i].position[2]) < .15, 'Dancers stay on the floor');
    }
    // Cover an entire loop: at least one visible sole stays on the deck,
    // including poses where generic foot-bone grounding previously hovered.
    for (let frame = 0; frame < 10; frame++) {
        for (const npc of await sample()) assert.ok(npc.soleY >= -.003 && npc.soleY <= .007,
            `Visible shoe must contact the deck, got y=${npc.soleY}`);
        await page.waitForTimeout(230);
    }
    await page.waitForFunction(() => document.querySelector('.hud-interaction-prompt[data-visible]')?.textContent.includes('Dance'));
    if (mobile) {
        const box = await page.locator('.hud-interaction-prompt').boundingBox();
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    } else {
        await page.keyboard.down('KeyE'); await page.waitForTimeout(100); await page.keyboard.up('KeyE');
    }
    await page.waitForFunction(() => window.gameTemplate.getGameEngine().genreModule.starlightDance.active);
    assert.deepEqual(errors, []);
    console.log('PASS', mobile ? 'mobile' : 'desktop', 'two generated NPCs, animated bones, stable placement, player dance interaction');
    await page.close();
} } finally { await browser.close(); }
