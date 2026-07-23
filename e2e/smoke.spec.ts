import { test, expect } from "@playwright/test"

test("loads the grid, narrows via search, and copies the token symbol", async ({ page, context }) => {
	await context.grantPermissions(["clipboard-read", "clipboard-write"])

	await page.goto("/")

	const firstCard = page.locator('[data-testid="icon-card"]').first()
	await expect(firstCard).toBeVisible({ timeout: 15_000 })

	const initialCount = await page.locator('[data-testid="icon-card"]').count()

	await page.locator('[data-testid="search-input"]').fill("bitcoin")
	await expect(page.locator('[data-testid="icon-card"]').first()).toBeVisible()
	// useDeferredValue lands the filtered results on a later render — poll until the count settles below the baseline.
	await expect.poll(() => page.locator('[data-testid="icon-card"]').count()).toBeLessThan(initialCount)

	await page.locator('[data-testid="copy-symbol-button"]').first().click()
	const copied = await page.evaluate(() => navigator.clipboard.readText())
	// The card copy action yields the token symbol (e.g. "btc"), not a URL.
	expect(copied.length).toBeGreaterThan(0)
	expect(copied).not.toMatch(/https?:\/\//)
	expect(copied).toMatch(/^[\w.-]+$/)
})
