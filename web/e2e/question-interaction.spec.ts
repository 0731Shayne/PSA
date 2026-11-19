import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("students can submit a single-choice answer and move on while its explanation loads", async ({ page, playwright, baseURL }) => {
  const teacher = await playwright.request.newContext({ baseURL });
  try {
    await expect(await teacher.post("/api/auth/dev-login")).toBeOK();
    const classroom = await teacher.post("/api/classrooms", { data: { name: "单选题验收" } });
    await expect(classroom).toBeOK();
    const { id: classroomId, join_code: joinCode } = await classroom.json();
    await expect(await page.request.post("/api/auth/register", {
      data: { username: `choice-${randomUUID()}`, password: "Playwright-QA2026", role: "student" },
    })).toBeOK();
    await expect(await page.request.post("/api/classrooms/join", { data: { join_code: joinCode } })).toBeOK();
    const created = await teacher.post(`/api/classrooms/${classroomId}/assignments`, {
      data: { question_ids: ["P001102", "P000001"], count: 2 },
    });
    await expect(created).toBeOK();
    const { id: assignmentId } = await created.json();

    await page.goto("/questions?query=P001102");
    const choice = page.getByRole("radio", { name: /^C\./ });
    await expect(choice).toBeVisible();
    await choice.check();
    await expect(choice).toBeChecked();

    await page.goto("/questions?query=P000851");
    await expect(page.getByRole("textbox", { name: "作答答案" })).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "判断正误" })).toHaveCount(0);

    await page.goto(`/tasks/${assignmentId}`);
    await page.getByRole("radio", { name: /^C\./ }).check();
    await page.getByRole("button", { name: "提交检查" }).click();
    await expect(page.getByText("第 1 次作答正确")).toBeVisible();

    const answerUrl = "**/question-bank/questions/P001102/answer?*";
    let releaseAnswer!: () => void;
    const waitForSwitch = new Promise<void>(resolve => { releaseAnswer = resolve; });
    await page.route(answerUrl, async route => {
      await waitForSwitch;
      await route.continue();
    });
    try {
      const sent = page.waitForRequest(answerUrl);
      await page.getByRole("button", { name: "查看答案与解析" }).click();
      await sent;
      await page.getByRole("button", { name: "下一题" }).click();
      await expect(page.getByText("P000001", { exact: true })).toBeVisible();
      const finished = page.waitForResponse(answerUrl);
      releaseAnswer();
      expect((await finished).ok()).toBe(true);
      await page.getByRole("textbox", { name: "作答答案" }).fill("1");
      const submission = page.waitForRequest(request =>
        request.url().includes("/api/question-bank/questions/") && request.url().endsWith("/attempts") && request.method() === "POST");
      await page.getByRole("button", { name: "提交检查" }).click();
      expect((await submission).url()).toContain("/questions/P000001/attempts");
      await expect(page.getByRole("heading", { name: "参考答案" })).toHaveCount(0);
    } finally {
      releaseAnswer();
    }
  } finally {
    await teacher.dispose();
  }
});
