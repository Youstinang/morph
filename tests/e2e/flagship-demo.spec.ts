import { expect, test } from "@playwright/test";

test("the flagship demo plays offline to the ending the user's budget picks", async ({ page }) => {
  const pageErrors: string[] = [];
  const outside: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.protocol.startsWith("http")) return;
    if (url.host !== "127.0.0.1:3110" || url.pathname.startsWith("/api/")) outside.push(request.url());
  });

  await page.goto("/lab");
  await expect(page.getByText("Should a European AI software company enter the UAE market?")).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "Playback speed 1x" }).click();

  const budget = page.getByRole("region", { name: "What's the most you can spend on the launch?" });
  await expect(budget).toBeVisible({ timeout: 30_000 });
  await budget.getByRole("slider").press("End");
  await budget.getByRole("button", { name: /^Send / }).click();
  await expect(budget).toBeHidden();

  const answer = page.getByRole("region", { name: "Recommendation" });
  await expect(answer).toBeVisible({ timeout: 45_000 });
  await expect(answer.getByRole("heading")).toHaveText("Go in alone, with UAE data hosting");
  await expect(answer).toContainText("demo data, not live research");

  const why = page.getByRole("button", { name: /^Why it changed \(\d+\)$/ });
  await why.click();
  await expect(page.getByText(/Gave the answer/)).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(outside).toEqual([]);
});

test("the AI endpoints refuse requests from other sites before doing any work", async ({ request }) => {
  const body = { objective: "Should our bakery deliver through apps?" };
  const crossSite = await request.post("/api/plan", { data: body, headers: { origin: "https://elsewhere.example" } });
  expect(crossSite.status()).toBe(403);
  const notJson = await request.post("/api/plan", { data: JSON.stringify(body), headers: { "content-type": "text/plain" } });
  expect(notJson.status()).toBe(415);
  const step = await request.post("/api/agent-step", { data: {}, headers: { "sec-fetch-site": "cross-site" } });
  expect(step.status()).toBe(403);
});

test("each page offers what it is for", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Ask a question" })).toBeVisible();

  await page.goto("/demo");
  await expect(page.getByRole("button", { name: "Restart" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask a question" })).toHaveCount(0);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/showcase");
  await expect(page.getByText("Should a European AI software company enter the UAE market?")).toBeVisible();
  await expect(page.getByRole("toolbar")).toHaveCount(0);
  const frame = await page.locator("main").boundingBox();
  expect(frame && Math.round((frame.width / frame.height) * 9)).toBe(16);
});
