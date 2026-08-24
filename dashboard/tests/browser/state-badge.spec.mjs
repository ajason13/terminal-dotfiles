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
        const content = await car.evaluate((el) => getComputedStyle(el, '::after').content);
        expect(content).toBe(`"${glyph}"`);
      }
    });
  }

  test('every pit state resolves to a distinct glyph', async ({ page }) => {
    const seen = await page.locator('#pit .pit-vehicle').evaluateAll(
      (els) => [...new Set(els.map((el) => getComputedStyle(el, '::after').content))],
    );
    expect(seen).toHaveLength(PIT_GLYPHS.length);
    expect(seen).not.toContain('none');
  });

  test('route cars carry their own badge and stay upright', async ({ page }) => {
    const cars = page.locator('.vehicle-anchor');
    await expect(cars).not.toHaveCount(0);
    for (const car of await cars.all()) {
      const badge = await car.evaluate((el) => {
        const style = getComputedStyle(el, '::after');
        return { content: style.content, transform: style.transform };
      });
      expect(['"›"', '"…"']).toContain(badge.content);
      // The badge hangs off the non-rotating wrapper, so it must never inherit
      // --route-heading the way .car-angle does.
      expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(badge.transform);
    }
  });
});
