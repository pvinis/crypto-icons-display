import { defineConfig, configDefaults } from "vitest/config"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
	plugins: [react(), tailwindcss()],
	test: {
		environment: "node",
		// Playwright specs run via `bun run e2e`, not Vitest.
		exclude: [...configDefaults.exclude, "e2e/**"],
	},
})
