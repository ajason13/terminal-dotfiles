import { expect, test } from '@playwright/test';

// The pit pool has no other at-a-glance state channel, so a silent regression here
// makes a permission-waiting session look identical to a finished one again.
const PIT_GLYPHS = [
  ['complete', '✓'],
  ['error', '×'],
  ['idle', '‖'],
  ['permission', '!'],
];

test.describe('session state badge', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/states.html');
    await expect(page.locator('#pit .pit-bay')).not.toHaveCount(0);
  });

  for (const [bay, glyph] of PIT_GLYPHS) {
    test(`${bay} cars carry the ${glyph} badge`, async ({ page }) => {
      const cars = page.locator(`#pit .pit-bay:has-text("${bay}") .pit-vehicle`);
      await expect(cars).not.toHaveCount(0);
      for (const car of await cars.all()) {
        const content = await car.evaluate((el) => getComputedStyle(el, '::before').content);
        expect(content).toBe(`"${glyph}"`);
      }
    });
  }

  test('every pit state resolves to a distinct glyph', async ({ page }) => {
    const seen = await page.locator('#pit .pit-vehicle').evaluateAll(
      (els) => [...new Set(els.map((el) => getComputedStyle(el, '::before').content))],
    );
    expect(seen).toHaveLength(PIT_GLYPHS.length);
    expect(seen).not.toContain('none');
  });

  test('route cars carry their own badge and stay upright', async ({ page }) => {
    const cars = page.locator('.vehicle-anchor');
    await expect(cars).not.toHaveCount(0);
    for (const car of await cars.all()) {
      const badge = await car.evaluate((el) => {
        const style = getComputedStyle(el, '::before');
        return { content: style.content, transform: style.transform };
      });
      expect(['"›"', '"…"']).toContain(badge.content);
      // The badge hangs off the non-rotating wrapper, so it must never inherit
      // --route-heading the way .car-angle does.
      expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(badge.transform);
    }
  });

  // The mobile focus ring owns .vehicle-anchor::after, so the badge must stay on
  // ::before. Putting both on ::after silently swaps the badge for the ring on focus.
  test('the mobile focus ring does not displace the badge', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const car = page.locator('.vehicle-anchor').first();
    await car.locator('.session-car').focus();
    const both = await car.evaluate((el) => ({
      badge: getComputedStyle(el, '::before').content,
      ring: getComputedStyle(el, '::after').content,
    }));
    expect(both.badge).not.toBe('none');
    expect(both.ring).toBe('""');
  });
});
