import { expect, Page, test } from "@playwright/test";

const createUniqueCredentials = () => {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return {
    email: `e2e.${stamp}@gymbro.test`,
    password: `StrongPass!${stamp.slice(-4)}`,
  };
};

const signUpFromLogin = async (page: Page, email: string, password: string) => {
  await page.goto("/login");
  await page.getByTestId("login-toggle-mode").click();
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-accept-legal").check();
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/onboarding/);
};

const completeOnboarding = async (page: Page) => {
  await page.getByTestId("onb-display-name").fill("E2E Athlete");
  await page.getByTestId("onb-language").selectOption("en");
  await page.getByTestId("onb-age").fill("34");
  await page.getByTestId("onb-weight").fill("81");
  await page.getByTestId("onb-height").fill("178");
  await page.getByTestId("onb-training-days").selectOption("7");
  await page.getByTestId("onb-experience").selectOption("intermediate");
  await page.getByTestId("onb-equipment").selectOption("gym");
  await page.getByTestId("onb-allergies").fill("none");
  await page.getByTestId("onb-session-minutes").fill("55");
  await page.getByTestId("onb-goal-strength").click();
  await page.getByTestId("onb-accept-terms").check();
  await page.getByTestId("onb-accept-privacy").check();
  await page.getByTestId("onb-accept-health").check();
  await page.getByTestId("onb-submit").click();
  await expect(page).toHaveURL(/\/dashboard\/plan(\?.*)?$/);
};

test.describe("Auth + onboarding + plan/session critical flow", () => {
  test("creates account, completes onboarding, regenerates, adjusts session by time", async ({ page }) => {
    const { email, password } = createUniqueCredentials();

    await signUpFromLogin(page, email, password);
    await completeOnboarding(page);

    await expect(page.getByTestId("plan-open-regeneration")).toBeVisible();
    await page.getByTestId("plan-open-regeneration").click();
    await expect(page.getByTestId("plan-apply-regeneration")).toBeVisible();
    await page.getByTestId("plan-reg-weight").fill("79");
    await page.getByTestId("plan-reg-minutes").fill("45");
    await page.getByTestId("plan-apply-regeneration").click();
    await expect(page.getByText(/Plan generated\./i)).toBeVisible();

    await page.goto("/dashboard/session");
    await page.getByTestId("session-available-minutes").fill("35");
    await page.getByTestId("session-adjust-time-only").click();
    await expect(page.getByText(/Session adjusted only by available time/i)).toBeVisible();
  });
});
