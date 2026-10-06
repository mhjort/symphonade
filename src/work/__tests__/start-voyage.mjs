/** Use the road traveler to retain the original 100 mk / 100% regression baseline. */
export async function startVoyage(page, traveler = process.env.TEST_TRAVELER ?? 'road') {
    await page.getByRole('button', { name: 'Step aboard', exact: true }).click({ force: true });
    await page.locator('dialog.traveler-selection[open]').waitFor();
    await page.locator(`[data-traveler="${traveler}"]`).click();
    await page.getByText('Ready to board', { exact: true }).waitFor({ timeout: 120000 });
    await page.getByRole('button', { name: 'Board the ferry', exact: true }).click();
    await page.waitForFunction(() => window.gameTemplate.getGameEngine().gameStateManager.getCurrentState() === 'playing');
}
