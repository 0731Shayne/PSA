import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("teaching edits made while saving remain unsaved and student export uses the student version", async ({ page }) => {
  await expect(await page.request.post("/api/auth/dev-login")).toBeOK();
  const created = await page.request.post("/api/question-bank/teaching-plan", {
    data: { topic: `条件概率验收-${randomUUID().slice(0, 8)}`, duration: 45, question_ids: ["P000001"] },
  });
  await expect(created).toBeOK();
  const { id, title } = await created.json();

  await page.goto("/teaching");
  await page.locator("button").filter({ hasText: title }).first().click();
  await page.getByText("编辑学生版", { exact: true }).click();
  const studentEditor = page.getByRole("textbox", { name: "编辑学生学习单内容" });
  const currentDraft = "# 学生版第二次输入";
  await studentEditor.fill("# 学生版第一次保存");

  const planUrl = `**/api/question-bank/teaching-plans/${id}`;
  let releaseSave!: () => void;
  const waitForSecondEdit = new Promise<void>(resolve => { releaseSave = resolve; });
  await page.route(planUrl, async route => {
    await waitForSecondEdit;
    await route.continue();
  });
  try {
    const saving = page.waitForRequest(planUrl);
    await page.getByRole("button", { name: "保存修改" }).click();
    await saving;
    await studentEditor.fill(currentDraft);
    const finished = page.waitForResponse(planUrl);
    releaseSave();
    expect((await finished).ok()).toBe(true);
    const save = page.getByRole("button", { name: "保存修改" });
    await expect(save).toBeVisible();
    await expect(save).not.toHaveClass(/ant-btn-loading/);
    await expect(studentEditor).toHaveValue(currentDraft);

    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出 Markdown" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toContain("学生学习单");
    const file = await download.path();
    expect(await readFile(file, "utf8")).toBe(currentDraft);
  } finally {
    releaseSave();
  }
});
