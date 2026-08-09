import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Checkbox, Empty, Input, Progress, Radio, Segmented, Skeleton, Tag, Upload, message } from "antd";
import type { UploadFile } from "antd";
import { ArrowLeftOutlined, ArrowRightOutlined, BulbOutlined, CameraOutlined, CheckCircleOutlined, EyeOutlined, SendOutlined } from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import { apiClient } from "@/api/client";
import { MathMarkdown } from "@/components/MathMarkdown";
import { isDemoMode } from "@/demo/demoApi";

interface Question {
  ID: string;
  qtype: string;
  question: string;
  choices: string[] | null;
  keypoint: string[];
  hard_level: string;
  answer?: string;
  explanation?: string;
  can_reveal?: boolean;
  teacher_view?: boolean;
  hint_policy?: "allowed" | "reduced" | "blocked";
  is_transfer?: boolean;
}

interface Assignment {
  id: number;
  classroom_name?: string;
  title: string;
  description?: string;
  kind: "diagnostic" | "intervention" | "retest";
  due_at?: string;
  hint_policy: "allowed" | "reduced" | "blocked";
  transfer_question_id?: string;
  question_ids: string[];
  attempted_question_ids?: string[];
  questions: Question[];
  my_status?: "assigned" | "completed";
}

interface Diagnostic {
  verdict: "correct" | "partial" | "incorrect" | "needs_review";
  feedback: string;
  error_type?: string;
  attempt_no: number;
  hint_count: number;
  submitted_late?: boolean;
  assignment_completed?: boolean;
  ocr_text?: string;
  ocr_status?: "completed" | "failed" | "not_configured";
}

const formulaKeys = [
  ["分式", "\\frac{}{}"], ["根号", "\\sqrt{}"], ["上标", "^{}"], ["下标", "_{}"],
  ["求和", "\\sum_{}^{}"], ["积分", "\\int_{}^{}"], ["条件概率", "P(A\\mid B)"],
  ["期望", "E(X)"], ["方差", "D(X)"], ["组合数", "\\binom{}{}"], ["μ", "\\mu"], ["σ", "\\sigma"],
];

export default function TaskRunnerPage() {
  const navigate = useNavigate();
  const assignmentId = Number(useParams().assignmentId);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [index, setIndex] = useState(0);
  const [attempted, setAttempted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [inputMode, setInputMode] = useState("formula");
  const [answer, setAnswer] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [file, setFile] = useState<UploadFile | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [hint, setHint] = useState("");
  const [hintLoading, setHintLoading] = useState(false);
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);

  useEffect(() => {
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) { setLoadError(true); setLoading(false); return; }
    let active = true;
    setLoading(true);
    apiClient.get<Assignment>(`/api/assignments/${assignmentId}`)
      .then(response => {
        if (!active) return;
        const data = response.data;
        const done = new Set(data.attempted_question_ids || []);
        const nextIndex = Math.max(0, data.question_ids.findIndex(id => !done.has(id)));
        setAssignment(data);
        setAttempted(done);
        setIndex(nextIndex);
        setLoadError(false);
      })
      .catch(() => { if (active) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [assignmentId]);

  const currentId = assignment?.question_ids[index];
  useEffect(() => {
    if (!currentId) { setQuestion(null); return; }
    let active = true;
    setDetailLoading(true);
    setAnswer(""); setReasoning(""); setFile(null); setImageDataUrl(""); setHint(""); setDiagnostic(null); setShowAnswer(false); setInputMode("formula");
    apiClient.get<Question>(`/api/question-bank/questions/${currentId}`, { params: { assignment_id: assignmentId } })
      .then(response => { if (active) setQuestion(response.data); })
      .catch(() => { if (active) { setQuestion(null); message.error("题目加载失败，请稍后重试"); } })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [assignmentId, currentId]);

  const completedCount = useMemo(() => assignment?.question_ids.filter(id => attempted.has(id)).length || 0, [assignment, attempted]);
  const expired = Boolean(assignment?.due_at && new Date(assignment.due_at).getTime() < Date.now());
  const hintBlocked = question?.hint_policy === "blocked" || question?.is_transfer;

  async function requestHint() {
    if (!question || hintLoading || hintBlocked) return;
    setHintLoading(true);
    try {
      const response = await apiClient.post<{ hint: string }>(`/api/question-bank/questions/${question.ID}/hint`, { answer, reasoning, assignment_id: assignmentId });
      setHint(response.data.hint);
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      message.warning(detail || "提示生成失败，请稍后重试");
    } finally { setHintLoading(false); }
  }

  async function submitAttempt() {
    if (!question) return;
    if (!answer.trim() && !reasoning.trim() && !imageDataUrl) { message.warning("请先填写答案、描述思路或上传手写过程"); return; }
    setSubmitting(true);
    try {
      const response = await apiClient.post<Diagnostic>(`/api/question-bank/questions/${question.ID}/attempts`, {
        answer,
        reasoning,
        input_mode: inputMode,
        image_name: file?.name,
        image_data_url: imageDataUrl,
        assignment_id: assignmentId,
      }, { timeout: imageDataUrl ? 210_000 : 30_000 });
      setDiagnostic(response.data);
      setAttempted(current => new Set(current).add(question.ID));
      message.success(response.data.assignment_completed ? "作答已保存，这项任务已完成" : "作答已保存");
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      message.error(detail || "提交失败，请保留当前作答并稍后重试");
    } finally { setSubmitting(false); }
  }

  async function revealAnswer() {
    if (!question || revealing) return;
    setRevealing(true);
    try {
      const response = await apiClient.get<Question>(`/api/question-bank/questions/${question.ID}/answer`, { params: { assignment_id: assignmentId } });
      setQuestion(current => current ? { ...current, ...response.data } : current);
      setShowAnswer(true);
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      message.warning(detail || "请先完成当前任务中的这道题");
    } finally { setRevealing(false); }
  }

  if (loading) return <div className="space-y-5"><Skeleton active paragraph={{ rows: 3 }} /><Skeleton active paragraph={{ rows: 9 }} /></div>;
  if (loadError || !assignment) return <Empty description="任务不存在、已撤回，或没有分配给你"><Button type="primary" onClick={() => navigate("/tasks")}>返回我的任务</Button></Empty>;
  if (!assignment.question_ids.length) return <Empty description="这项任务暂时没有题目"><Button onClick={() => navigate("/tasks")}>返回我的任务</Button></Empty>;

  return <div className="mx-auto max-w-5xl">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div><Button type="link" className="!-ml-4" icon={<ArrowLeftOutlined />} onClick={() => navigate("/tasks")}>返回我的任务</Button><h1 className="text-2xl font-bold text-slate-950">{assignment.title}</h1><p className="mt-1 text-sm leading-6 text-slate-600">{assignment.classroom_name}{assignment.description ? ` · ${assignment.description}` : ""}</p></div>
      <div className="min-w-52"><div className="mb-1.5 flex justify-between text-sm text-slate-600"><span>任务进度</span><strong>{completedCount}/{assignment.question_ids.length}</strong></div><Progress percent={Math.round(completedCount / assignment.question_ids.length * 100)} showInfo={false} strokeColor="#0f766e" /></div>
    </div>
    {expired && <Alert className="mb-5" type="warning" showIcon message="任务已截止，但仍可补交" description="本次作答会保留并标记为截止后提交，教师可以在证据中区分。" />}
    <div className="mb-5 flex gap-2 overflow-x-auto pb-1" aria-label="任务题目进度">
      {assignment.question_ids.map((id, itemIndex) => <button key={id} onClick={() => setIndex(itemIndex)} className={`min-w-24 rounded-lg border px-3 py-2 text-sm font-semibold ${itemIndex === index ? "border-teal-700 bg-teal-50 text-teal-900" : "border-slate-200 bg-white text-slate-600"}`}>{attempted.has(id) && <CheckCircleOutlined className="mr-1 text-emerald-600" />}{itemIndex + 1}. {id}</button>)}
    </div>
    {detailLoading || !question ? <div className="border border-slate-200 bg-white p-6"><Skeleton active paragraph={{ rows: 8 }} /></div> : <div className="space-y-5">
      <section className="border border-slate-200 bg-white p-6 sm:p-8">
        <div className="mb-4 flex flex-wrap items-center gap-2"><Tag color="cyan">{question.ID}</Tag><Tag>{question.qtype}</Tag><Tag color={question.hard_level === "难" ? "red" : question.hard_level === "中" ? "orange" : "green"}>{question.hard_level}</Tag>{question.is_transfer && <Tag color="purple">无提示迁移验证</Tag>}</div>
        <div className="text-base leading-8 text-slate-800"><MathMarkdown>{question.question}</MathMarkdown></div>
        {question.choices && <div className="mt-4 space-y-2">{question.choices.map(item => <div key={item} className="rounded-lg bg-slate-50 px-4 py-2"><MathMarkdown>{item}</MathMarkdown></div>)}</div>}
      </section>
      <section className="border border-slate-200 bg-white p-6 sm:p-8">
        <div className="mb-4"><h2 className="text-lg font-bold text-slate-900">提交你的作答</h2><p className="mt-1 text-sm text-slate-600">可以填写最终答案、描述思路，或上传手写过程。</p></div>
        <Segmented block value={inputMode} onChange={value => setInputMode(String(value))} options={[{ label: "公式 / 答案", value: "formula" }, { label: "描述思路", value: "reasoning" }, { label: "手写图片", value: "image" }]} />
        <div className="mt-5">{question.qtype === "多选题" && question.choices ? <Checkbox.Group className="!grid !gap-3" options={question.choices.map(item => ({ label: <MathMarkdown>{item}</MathMarkdown>, value: item.match(/^\(\d+\)/)?.[0] || item }))} onChange={values => setAnswer(values.join("，"))} /> : question.qtype === "判断题" ? <Radio.Group value={answer} onChange={event => setAnswer(event.target.value)} options={[{ label: "正确", value: "正确" }, { label: "错误", value: "错误" }]} /> : inputMode === "formula" ? <><div className="mb-3 flex flex-wrap gap-2">{formulaKeys.map(([label, token]) => <Button key={label} size="small" onClick={() => setAnswer(value => value + token)}>{label}</Button>)}</div><Input.TextArea value={answer} onChange={event => setAnswer(event.target.value)} rows={3} maxLength={2000} showCount placeholder="输入最终答案或公式，例如：\\frac{1}{2}" />{answer && <div className="mt-3 bg-slate-50 p-4 text-center"><MathMarkdown>{`$$${answer}$$`}</MathMarkdown></div>}</> : inputMode === "reasoning" ? <Input.TextArea value={reasoning} onChange={event => setReasoning(event.target.value)} rows={6} maxLength={5000} showCount placeholder="描述你使用的公式、条件和关键步骤" /> : <div>{isDemoMode && <Alert className="mb-3" type="warning" showIcon message="演示版不会调用真实 OCR" />}<Upload.Dragger accept="image/jpeg,image/png,image/webp" maxCount={1} beforeUpload={upload => { if (upload.size > 2_000_000) { message.error("图片请控制在 2MB 以内"); return Upload.LIST_IGNORE; } setFile(upload); const reader = new FileReader(); reader.onload = () => setImageDataUrl(String(reader.result || "")); reader.readAsDataURL(upload); return false; }} onRemove={() => { setFile(null); setImageDataUrl(""); }} fileList={file ? [file] : []}><CameraOutlined className="text-2xl text-teal-700" /><p className="mt-2 font-semibold">上传手写过程照片</p><p className="text-sm text-slate-500">支持 JPG、PNG、WebP，2MB 以内</p></Upload.Dragger><Input.TextArea className="mt-3" value={reasoning} onChange={event => setReasoning(event.target.value)} rows={3} placeholder="补充图片中的关键步骤或结论（推荐）" /></div>}</div>
        {inputMode !== "reasoning" && question.qtype !== "判断题" && question.qtype !== "多选题" && <Input.TextArea className="mt-3" value={reasoning} onChange={event => setReasoning(event.target.value)} rows={3} placeholder="可选：用自然语言描述你的解题思路" />}
        {hintBlocked && <Alert className="mt-4" type="info" showIcon message="本题不提供提示" description="这是独立迁移证据，提交后仍可查看诊断反馈和参考解析。" />}
        {hint && <Alert className="mt-4" type="info" showIcon message="启发提示" description={<MathMarkdown>{hint}</MathMarkdown>} />}
        {diagnostic && <Alert className="mt-4" type={diagnostic.verdict === "correct" ? "success" : diagnostic.verdict === "incorrect" ? "error" : "warning"} showIcon message={diagnostic.verdict === "correct" ? `第 ${diagnostic.attempt_no} 次作答正确` : `第 ${diagnostic.attempt_no} 次作答诊断`} description={<div><MathMarkdown>{diagnostic.feedback}</MathMarkdown>{diagnostic.error_type && <Tag className="mt-2" color="orange">{diagnostic.error_type}</Tag>}{diagnostic.submitted_late && <Tag className="mt-2" color="red">截止后提交</Tag>}</div>} />}
        <div className="mt-5 flex flex-wrap gap-3"><Button icon={<BulbOutlined />} loading={hintLoading} disabled={hintBlocked} onClick={requestHint}>给我一个提示</Button><Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={submitAttempt}>提交检查</Button></div>
      </section>
      {showAnswer ? <section className="grid gap-4 md:grid-cols-2"><Block title="参考答案" text={question.answer || "暂无"} tone="green" /><Block title="详细解析" text={question.explanation || "暂无"} tone="blue" /></section> : <Button block size="large" icon={<EyeOutlined />} loading={revealing} onClick={revealAnswer}>{question.can_reveal || diagnostic ? "查看答案与解析" : "先完成这道题，再查看答案"}</Button>}
      <div className="flex justify-between gap-3"><Button icon={<ArrowLeftOutlined />} disabled={index === 0} onClick={() => setIndex(value => Math.max(0, value - 1))}>上一题</Button>{index < assignment.question_ids.length - 1 ? <Button type="primary" onClick={() => setIndex(value => Math.min(assignment.question_ids.length - 1, value + 1))}>下一题 <ArrowRightOutlined /></Button> : <Button type="primary" onClick={() => navigate("/tasks")}>{completedCount === assignment.question_ids.length ? "完成并返回任务列表" : "返回任务列表"}</Button>}</div>
    </div>}
  </div>;
}

function Block({ title, text, tone }: { title: string; text: string; tone: "green" | "blue" }) {
  const cls = tone === "green" ? "border-emerald-100 bg-emerald-50 text-emerald-950" : "border-sky-100 bg-sky-50 text-sky-950";
  return <section className={`border p-5 ${cls}`}><h3 className="mb-3 font-bold">{title}</h3><div className="leading-8"><MathMarkdown>{text}</MathMarkdown></div></section>;
}
