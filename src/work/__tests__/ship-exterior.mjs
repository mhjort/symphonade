import { startVoyage } from './start-voyage.mjs';
// Exercise the complete hull and interior view culling with real game cameras.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
const { gamePort } = JSON.parse(await fs.readFile('.bitmagic/dev.json', 'utf8'));
const out = '.bitmagic/ship-exterior';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] });
try {
    for (const mobile of [false, true]) {
        const platform = mobile ? 'mobile' : 'desktop';
        const page = await browser.newPage(mobile ? devices['iPhone 14'] : { viewport: { width: 1280, height: 900 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://localhost:${gamePort}/`);
        await page.waitForFunction(() => window.gameTemplate?.getGameEngine()?.genreModule?.slotMachine?.body, null, { timeout: 90000 });
        await startVoyage(page);
        const state = () => page.evaluate(() => {
            const ship = window.gameTemplate.getGameEngine().genreModule.ship;
            return { total: ship.exteriorMeshes.length, visible: ship.exteriorMeshes.filter(m => m.visible).length };
        });
        const place = async (position, target) => {
            await page.evaluate(({ position: [x,y,z], target: [tx,ty,tz] }) => {
                const pc = window.gameTemplate.getGameEngine().getPlayerController();
                pc.teleportTo(x,y,z);
                pc.cameraController.setHorizontalAngle(Math.atan2(x-tx,z-tz));
                pc.cameraController.setVerticalAngle(Math.atan2(y+1.6-ty,Math.hypot(x-tx,z-tz)));
            }, { position, target });
            await page.waitForTimeout(250);
        };
        await place([-24,.15,13],[-10,1.7,13]);
        let shell = await state();
        assert.ok(shell.total > 0, 'Restored source shell is present');
        assert.equal(shell.visible, shell.total, 'Shell visible from the terminal gangway');
        for (const [name, position, target] of [
            ['promenade', [0,.15,6], [0,21,12]],
            ['lounge', [0,3.55,65], [0,5.2,110]],
            ['sea-cabin', [14.8,3.55,14], [30,5.2,14]],
            ['club', [9.3,3.55,49], [30,5.2,49]],
        ]) {
            await place(position, target);
            assert.equal((await state()).visible, 0, `${name}: original shell cannot obstruct sea/sky views`);
            await page.screenshot({ path: `${out}/${platform}-${name}.png` });
        }
        // An exterior camera must show the hull even if the player stays indoors.
        const separateCameraVisible = await page.evaluate(() => {
            const e = window.gameTemplate.getGameEngine(), ship = e.genreModule.ship;
            const camera = e.camera.clone();
            camera.position.set(-90,30,155);
            camera.updateMatrixWorld(true);
            ship.updateExteriorVisibility(camera);
            const visible = ship.exteriorMeshes.every(mesh => mesh.visible);
            ship.updateExteriorVisibility(e.camera);
            return visible;
        });
        assert.ok(separateCameraVisible, 'Culling follows the camera, not the player');
        await place([-95,35,160], [0,7,40]);
        shell = await state();
        assert.equal(shell.visible, shell.total, 'Full bow restored for exterior camera');
        await page.screenshot({ path: `${out}/${platform}-bow.png` });
        await place([95,35,160], [0,7,40]);
        await page.screenshot({ path: `${out}/${platform}-starboard.png` });
        await place([-25,27,2], [0,25,-20]);
        assert.equal((await state()).visible, shell.total, 'Funnel visible from the upper exterior');
        await page.screenshot({ path: `${out}/${platform}-funnel.png` });
        assert.deepEqual(errors, [], 'No browser errors');
        console.log('PASS', platform, 'terminal/exterior visibility, independent camera, lounge/cabin/club/roof views');
        await page.close();
    }
} finally {
    await browser.close();
}
