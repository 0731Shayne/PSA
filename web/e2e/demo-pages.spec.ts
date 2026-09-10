import { expect, test } from "@playwright/test";

test("teacher demo exposes evidence and teaching workflows", async ({ page }) => {
  await page.goto("./login");
  await page.getByRole("button", { name: /进入教师端演示/ }).click();
  await expect(page).toHaveURL(/\/PSA\/dashboard$/);
  await expect(page.getByText("模拟演示").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "打开演示教师的账号菜单" })).toBeVisible();

  await page.goto("./classrooms");
  await expect(page.getByRole("heading", { name: "班级认知雷达" })).toBeVisible();
  await expect(page.getByText("条件方向存在稳定混淆")).toHaveCount(0);
  await expect(page.getByText("前置回补组").first()).toBeVisible();
  await page.getByRole("button", { name: "生成并审核任务草稿" }).click();
  await expect(page.getByRole("dialog", { name: "审核分组任务草稿" })).toBeVisible();
  await expect(page.getByText("此处只是草稿，确认前不会发给学生")).toBeVisible();
  await page.getByRole("button", { name: "继续查看雷达" }).click();

  await page.goto("./teaching");
  await expect(page.getByRole("heading", { name: "分层教学包工作台" })).toBeVisible();
  await page.locator("button").filter({ hasText: "贝叶斯公式 · 45分钟分层教学包" }).first().click();
  await expect(page.getByRole("heading", { name: "贝叶斯公式 · 45分钟分层教学包" })).toBeVisible();
  await page.getByText("编辑学生版", { exact: true }).click();
  await expect(page.getByLabel("编辑学生学习单内容")).toBeVisible();
});

test("student demo covers tasks, learning path, questions, and tutor", async ({ page }) => {
  await page.goto("./login");
  await page.getByRole("button", { name: /进入学生端演示/ }).click();
  await expect(page.getByRole("button", { name: "打开演示学生的账号菜单" })).toBeVisible();

  await page.goto("./tasks");
  await expect(page.getByRole("heading", { name: "我的任务" })).toBeVisible();
  await expect(page.getByText("条件概率课前诊断").first()).toBeVisible();
  await page.getByRole("button", { name: "继续完成" }).first().click();
  await expect(page).toHaveURL(/\/tasks\/101$/);
  await expect(page.getByRole("heading", { name: "条件概率课前诊断" })).toBeVisible();
  await expect(page.getByText("2. P000082")).toBeVisible();

  await page.goto("./experiments?id=bayes");
  await expect(page.getByRole("heading", { name: "实验记录" })).toBeVisible();
  await expect(page.getByRole("button", { name: "重新打开" })).toHaveCount(2);
  await page.getByRole("checkbox", { name: "比较" }).nth(0).check();
  await page.getByRole("checkbox", { name: "比较" }).nth(1).check();
  await expect(page.getByText("观察：先验率越低，同样的阳性结果越需要谨慎解释。").first()).toBeVisible();

  await page.goto("./learning-path");
  await expect(page.getByRole("heading", { name: /下一步，先学好/ })).toBeVisible();
  await expect(page.getByText("条件方向存在稳定混淆")).toBeVisible();

  await page.goto("./questions");
  await expect(page.getByRole("heading", { name: "概率统计题库" })).toBeVisible();
  await expect(page.getByText("P000001").first()).toBeVisible();

  await page.goto("./tutor");
  await page.getByLabel("输入问题").fill("如何判断一道题该用贝叶斯公式？");
  await page.getByRole("button", { name: "发送问题" }).click();
  await expect(page.getByText("回答来源：模拟题库演示")).toBeVisible({ timeout: 10_000 });
});

test("demo remains usable on a mobile viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "demo-mobile", "mobile-only regression");
  await page.goto("./login");
  await page.getByRole("button", { name: /进入学生端演示/ }).click();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  const width = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
});

test("answer drafts survive question changes and reloads", async ({ page }) => {
  await page.goto("./login");
  await page.getByRole("button", { name: /进入学生端演示/ }).click();
  await page.getByRole("button", { name: "继续完成任务" }).click();
  const answer = page.getByRole("textbox", { name: "作答答案" });
  await answer.fill("0.023");
  await page.getByRole("button", { name: "下一题", exact: true }).click();
  await page.getByRole("button", { name: "上一题", exact: true }).click();
  await expect(answer).toHaveValue("0.023");
  await page.reload();
  await expect(answer).toHaveValue("0.023");
  await answer.fill("请核对我的推导过程");
  await page.getByRole("button", { name: "提交检查" }).click();
  await expect(page.getByText("第 1 次作答已保存 · 待复核")).toBeVisible();
  await page.getByRole("button", { name: "提交检查" }).click();
  await expect(page.getByText("第 1 次作答已保存 · 待复核")).toBeVisible();
  await expect(page.getByText("第 2 次作答已保存 · 待复核")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "提交检查" })).not.toHaveClass(/ant-btn-loading/);
  await page.getByRole("button", { name: "切换到教师端" }).click();
  await page.getByRole("button", { name: "查看待复核作答" }).click();
  await expect(page.getByRole("tab", { name: "待复核 (1)" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "查看并复核" }).click();
  await expect(page.getByText("请核对我的推导过程", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "复核依据" }).fill("教师已核对公式及计算过程。");
  await page.getByRole("button", { name: "保存复核结果" }).click();
  await expect(page.getByText("没有待复核作答")).toBeVisible();
  await page.getByRole("button", { name: "切换到学生端" }).click();
  await page.goto("./tasks/101");
  await page.getByRole("button", { name: /2. P000082/ }).click();
  await expect(page.getByText("教师已核对公式及计算过程。")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "作答答案" })).toHaveValue("请核对我的推导过程");
});

test("normal curves change on fixed axes and saved simulations reopen exactly", async ({ page }) => {
  await page.goto("./login");
  await page.getByRole("button", { name: /进入学生端演示/ }).click();
  await page.goto("./experiments?id=normal");
  const curve = page.locator('[data-series="current"]').first();
  const baseline = page.locator('[data-series="baseline"]').first();
  const before = await curve.getAttribute("d");
  const reference = await baseline.getAttribute("d");
  await page.getByRole("slider", { name: "标准差 σ" }).press("End");
  await expect(curve).not.toHaveAttribute("d", before!);
  await expect(baseline).toHaveAttribute("d", reference!);
  await page.goto("./experiments?id=coin");
  await expect(page.getByRole("heading", { name: "大数定律：抛硬币" })).toBeVisible();
  const original = await curve.getAttribute("d");
  await page.getByRole("button", { name: "保存本次实验记录" }).click();
  await expect(page.getByRole("button", { name: "重新打开" })).toHaveCount(3);
  await page.getByRole("button", { name: "重新运行模拟" }).click();
  await expect(curve).not.toHaveAttribute("d", original!);
  await page.getByRole("button", { name: "重新打开" }).first().click();
  await expect(curve).toHaveAttribute("d", original!);
  await expect(page.getByRole("button", { name: "以这些参数重新运行" })).toBeVisible();
});
