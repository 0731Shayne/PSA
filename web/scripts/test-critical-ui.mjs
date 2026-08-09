import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tutor = readFileSync(new URL("../src/pages/TutorPage.tsx", import.meta.url), "utf8");
const questionBank = readFileSync(new URL("../src/pages/QuestionBankPage.tsx", import.meta.url), "utf8");
const auth = readFileSync(new URL("../src/contexts/AuthContext.tsx", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const studio = readFileSync(new URL("../src/pages/TeachingStudio.tsx", import.meta.url), "utf8");
const taskRunner = readFileSync(new URL("../src/pages/TaskRunnerPage.tsx", import.meta.url), "utf8");
const classroom = readFileSync(new URL("../src/pages/ClassroomRadarPage.tsx", import.meta.url), "utf8");
const experiment = readFileSync(new URL("../src/pages/ExperimentLab.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

assert.doesNotMatch(
  tutor,
  /useEffect\(\(\)\s*=>\s*bottom\.current\?\.scrollIntoView/,
  "scroll effect must not return the scrollIntoView result",
);
assert.match(tutor, /useEffect\(\(\)\s*=>\s*\{[\s\S]*?bottom\.current\?\.scrollIntoView/);
assert.match(tutor, /credentials:\s*"same-origin"/);
assert.match(questionBank, /questions\/\$\{selected\.ID\}\/answer/);
assert.doesNotMatch(auth, /localStorage\.setItem\("token"/);
assert.match(main, /@ant-design\/v5-patch-for-react-19/);
assert.match(app, /function ScrollToTop/);
assert.match(questionBank, /question-card-markdown[\s\S]*min-w-0/);
assert.match(tutor, /settingsOpen/);
assert.match(tutor, /send\(starter\.text, starter\.mode\)/);
assert.match(tutor, /第 \{sourceIndex \+ 1\} 题/);
assert.match(tutor, /回答来源：\{modelLabel\(item\.model\)\}/);
assert.match(styles, /\.tutor-markdown table[\s\S]*width:\s*max-content/);
assert.doesNotMatch(studio, /<main className="min-h-\[720px\]/);
assert.match(studio, /打印 \/ 保存 PDF/);
assert.match(studio, /编辑学生版/);
assert.match(studio, /发布前确认/);
assert.match(taskRunner, /assignment_id:\s*assignmentId/);
assert.match(taskRunner, /无提示迁移验证/);
assert.match(classroom, /interventions\/preview/);
assert.match(classroom, /此处只是草稿，确认前不会发给学生/);
assert.match(experiment, /重新打开/);
assert.match(experiment, /并排比较/);

console.log("critical UI regression checks passed");
