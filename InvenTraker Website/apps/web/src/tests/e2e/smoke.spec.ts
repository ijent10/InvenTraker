import { expect, test } from "@playwright/test"

test("landing page renders with core CTAs", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1, name: "InvenTraker", exact: true })).toBeVisible()
  const hero = page.getByRole("banner")
  await expect(hero.getByRole("link", { name: "Sign in", exact: true })).toBeVisible()
  await expect(hero.getByRole("link", { name: "Create account", exact: true })).toBeVisible()
})

test("sign-in page renders auth form", async ({ page }) => {
  await page.goto("/signin")
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible()
  await expect(page.getByLabel("Email")).toBeVisible()
  await expect(page.getByLabel("Password")).toBeVisible()
})
