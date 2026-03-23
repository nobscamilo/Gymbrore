import { expect, Page, test } from "@playwright/test";

const assertNoHorizontalOverflow = async (page: Page) => {
  await test.step("no horizontal overflow", async () => {
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 1;
    });
    expect(hasOverflow).toBeFalsy();
  });
};

test.use({
  viewport: { width: 390, height: 844 },
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

test.describe("Mobile Google auth flow (mocked on emulator)", () => {
  test("signs up with Google button and completes onboarding without mobile overflow", async ({ page }) => {
    await page.goto("/login");
    await assertNoHorizontalOverflow(page);

    await page.getByTestId("login-toggle-mode").click();
    await page.getByTestId("login-accept-legal").check();
    await page.getByTestId("login-google").click();

    await expect(page).toHaveURL(/\/onboarding/);
    await assertNoHorizontalOverflow(page);

    await page.getByTestId("onb-display-name").fill("E2E Google Mobile");
    await page.getByTestId("onb-language").selectOption("en");
    await page.getByTestId("onb-age").fill("33");
    await page.getByTestId("onb-weight").fill("78");
    await page.getByTestId("onb-height").fill("176");
    await page.getByTestId("onb-training-days").selectOption("4");
    await page.getByTestId("onb-experience").selectOption("intermediate");
    await page.getByTestId("onb-equipment").selectOption("gym");
    await page.getByTestId("onb-allergies").fill("none");
    await page.getByTestId("onb-session-minutes").fill("50");
    await page.getByTestId("onb-goal-strength").click();
    await page.getByTestId("onb-accept-terms").check();
    await page.getByTestId("onb-accept-privacy").check();
    await page.getByTestId("onb-accept-health").check();
    await page.getByTestId("onb-submit").click();

    await expect(page).toHaveURL(/\/dashboard\/plan(\?.*)?$/);

    await page.goto("/dashboard/library");
    await expect(page.getByRole("button", { name: /open qa panel|abrir panel qa/i })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });
});
