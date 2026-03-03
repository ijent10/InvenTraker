import { expect, test } from "@playwright/test"

test("landing page renders with core CTAs", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "InvenTraker" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Create account" })).toBeVisible()
})

test("sign-in page renders auth form", async ({ page }) => {
  await page.goto("/signin")
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible()
  await expect(page.getByLabel("Email")).toBeVisible()
  await expect(page.getByLabel("Password")).toBeVisible()
})
