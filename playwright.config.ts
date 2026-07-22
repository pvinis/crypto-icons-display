import { defineConfig } from "@playwright/test"

export default defineConfig({
	testDir: "./e2e",
	webServer: {
		command: "bun run preview -- --port 4321",
		url: "http://localhost:4321",
		reuseExistingServer: !process.env.CI,
		timeout: 30_000,
	},
	use: {
		baseURL: "http://localhost:4321",
	},
})
