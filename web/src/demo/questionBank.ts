export interface BankQuestion {
  ID: string;
  qtype: string;
  question: string;
  choices: string[] | null;
  keypoint: string[];
  hard_level: string;
  subject: string;
  answer: string;
  explanation: string;
}

async function readBank(): Promise<BankQuestion[]> {
  if (import.meta.env.VITE_STATIC_PREVIEW !== "true") throw new Error("仅演示模式读取静态题库");
  const response = await fetch(`${import.meta.env.BASE_URL}question-bank.jsonl`);
  if (!response.ok) throw new Error("题库加载失败");
  return (await response.text()).trim().split("\n").map(line => JSON.parse(line) as BankQuestion);
}

let pending: Promise<BankQuestion[]> | undefined;

export function loadDemoQuestions() {
  pending ??= readBank().catch(error => {
    pending = undefined;
    throw error;
  });
  return pending;
}

export function questionSummary({ ID, qtype, question, choices, keypoint, hard_level, subject }: BankQuestion) {
  return { ID, qtype, question, choices, keypoint, hard_level, subject };
}

export async function demoBankStats() {
  const rows = await loadDemoQuestions();
  const qtypes: Record<string, number> = {};
  const difficulties: Record<string, number> = {};
  const keypoints: Record<string, number> = {};
  for (const row of rows) {
    qtypes[row.qtype] = (qtypes[row.qtype] ?? 0) + 1;
    difficulties[row.hard_level] = (difficulties[row.hard_level] ?? 0) + 1;
    for (const name of row.keypoint) keypoints[name] = (keypoints[name] ?? 0) + 1;
  }
  return { total: rows.length, qtypes, difficulties, keypoints };
}

export async function demoTutorSources() {
  const rows = await loadDemoQuestions();
  return ["P000001", "P000082", "P000066"].map(id => questionSummary(rows.find(q => q.ID === id)!));
}
