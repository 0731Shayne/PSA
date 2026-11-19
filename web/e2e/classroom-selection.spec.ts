import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("an older radar response cannot replace the selected class", async ({ page }) => {
  await expect(await page.request.post("/api/auth/dev-login")).toBeOK();
  const suffix = randomUUID().slice(0, 8);
  const firstClass = await page.request.post("/api/classrooms", { data: { name: `验收甲班-${suffix}` } });
  const secondClass = await page.request.post("/api/classrooms", { data: { name: `验收乙班-${suffix}` } });
  await expect(firstClass).toBeOK();
  await expect(secondClass).toBeOK();
  const first = await firstClass.json();
  const second = await secondClass.json();

  const firstUrl = `**/api/classrooms/${first.id}/radar`;
  let releaseFirst!: () => void;
  const waitForSwitch = new Promise<void>(resolve => { releaseFirst = resolve; });
  await page.route(firstUrl, async route => {
    await waitForSwitch;
    await route.continue();
  });
  try {
    const started = page.waitForRequest(firstUrl);
    await page.goto(`/classrooms?classroom=${first.id}`);
    await started;
    await page.getByRole("combobox", { name: "选择班级" }).press("ArrowDown");
    await page.getByText(second.name, { exact: true }).click();
    await expect(page.getByRole("button", { name: second.join_code })).toBeVisible();

    const finished = page.waitForResponse(firstUrl);
    releaseFirst();
    expect((await finished).ok()).toBe(true);
    await page.getByRole("button", { name: "更换班级码" }).click();
    await expect(page.getByRole("button", { name: second.join_code })).toBeVisible();
    await expect(page.getByRole("button", { name: first.join_code })).toHaveCount(0);
    await page.getByRole("button", { name: /^取\s*消$/ }).click();
  } finally {
    releaseFirst();
  }
});
