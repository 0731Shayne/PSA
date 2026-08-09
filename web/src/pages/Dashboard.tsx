import { useEffect, useState } from "react";
import { Alert, Button, Skeleton } from "antd";
import { ArrowRightOutlined, BookOutlined, BulbOutlined, CheckSquareOutlined, ClockCircleOutlined, ExperimentOutlined, MessageOutlined, NodeIndexOutlined, RadarChartOutlined, ReadOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";

interface Stats { total: number; qtypes: Record<string, number>; difficulties: Record<string, number>; keypoints: Record<string, number> }
interface LearningSummary { sessions: number; questions_seen: number; assistant_answers: number; attempts: number; attempted_questions: number; correct_questions: number; focus_keypoints: { name: string; count: number }[]; recent_sessions: { id: number; title: string; updated_at: string }[] }

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [learning, setLearning] = useState<LearningSummary | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const teacher = user?.role === "teacher";

  useEffect(() => {
    let active = true;
    setLoadError(false);
    const requests: Promise<unknown>[] = [apiClient.get<Stats>("/api/question-bank/stats").then(response => { if (active) setStats(response.data); })];
    if (!teacher) requests.push(apiClient.get<LearningSummary>("/api/question-bank/learning-summary").then(response => { if (active) setLearning(response.data); }));
    Promise.all(requests).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [teacher, reloadKey]);

  const keypoints = Object.entries(stats?.keypoints || {}).slice(0, 8);
  const accuracy = learning?.attempted_questions ? Math.round((learning.correct_questions / learning.attempted_questions) * 100) : 0;
  const loading = !loadError && (!stats || (!teacher && !learning));

  return (
    <div className="dashboard-page">
      {loadError && <Alert className="mb-5" type="error" showIcon message="暂时无法载入学习数据" description="请检查网络连接后重试；导航仍可使用，数据将在连接恢复后更新。" action={<Button size="small" onClick={() => setReloadKey(value => value + 1)}>重新加载</Button>} />}

      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <p className="dashboard-eyebrow"><span>第 01 章</span> 你好，{user?.name}</p>
          <h1>{teacher ? "把知识点组织成一堂好课" : "从一道题开始，真正理解概率统计"}</h1>
          <p className="dashboard-intro">{teacher ? "从专属题库生成分层学习单、课堂检测与认知断层预警。" : "系统会根据作答、错误类型和提示使用情况，持续更新你的学习路径。"}</p>
          <div className="dashboard-actions">
            <button onClick={() => navigate(teacher ? "/classrooms" : "/tasks")} className="dashboard-primary-action">{teacher ? "查看班级认知雷达" : "查看我的任务"} <ArrowRightOutlined /></button>
            <button onClick={() => navigate("/questions")} className="dashboard-secondary-action">浏览课程题库</button>
          </div>
        </div>
        <div className="dashboard-figure" aria-label="贝叶斯公式与概率曲线示意">
          <div className="dashboard-figure-caption"><span>FIG. 01</span><span>条件概率</span></div>
          <ProbabilitySketch />
          <div className="dashboard-formula"><strong>P(A|B)</strong><span>= P(B|A)P(A) / P(B)</span></div>
          <p>新的观测证据，会改变我们对事件概率的判断。</p>
          <button onClick={() => navigate("/questions?keypoint=贝叶斯公式")}>查看相关题目 <ArrowRightOutlined /></button>
        </div>
      </section>

      <section aria-label="学习概览" className="dashboard-ledger">
        {loading ? <div className="col-span-3 grid gap-5 p-6 md:grid-cols-3"><Skeleton active paragraph={{ rows: 2 }} /><Skeleton active paragraph={{ rows: 2 }} /><Skeleton active paragraph={{ rows: 2 }} /></div> : teacher ? <><Stat icon={<BookOutlined />} label="题库总量" value={stats?.total ?? "—"} note="覆盖概率论与数理统计" /><Stat icon={<BulbOutlined />} label="知识点" value={stats ? Object.keys(stats.keypoints).length : "—"} note="支持按考点精准检索" /><Stat icon={<ReadOutlined />} label="题型" value={stats ? Object.keys(stats.qtypes).length : "—"} note={stats ? Object.keys(stats.qtypes).slice(0, 3).join(" · ") : "等待数据恢复"} /></> : <><Stat icon={<MessageOutlined />} label="学习会话" value={learning?.sessions ?? "—"} note="累计保留的答疑会话" /><Stat icon={<BookOutlined />} label="已作答题目" value={learning?.attempted_questions ?? "—"} note={`其中 ${learning?.correct_questions ?? 0} 题已正确完成`} /><Stat icon={<BulbOutlined />} label="当前正确率" value={learning ? `${accuracy}%` : "—"} note={learning?.attempted_questions ? `基于 ${learning.attempted_questions} 道已作答题目` : "完成作答后开始统计"} /></>}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
        <div className="editorial-panel">
          <div className="mb-4 flex items-center justify-between gap-4"><div><h2 className="text-lg font-extrabold text-slate-900">{teacher ? "热门知识点" : "我的学习焦点"}</h2><p className="mt-1 text-sm text-slate-500">{teacher ? "选择知识点查看相关题目" : "根据近期答疑引用自动归纳"}</p></div><Button type="link" onClick={() => navigate("/questions")}>全部题目</Button></div>
          {!teacher && learning?.focus_keypoints.length === 0 ? <div className="flex min-h-52 flex-col items-center justify-center border-t border-slate-100 text-center"><BulbOutlined className="text-2xl text-slate-400" /><p className="mt-3 text-sm font-bold text-slate-700">完成第一次答疑后生成学习焦点</p><Button className="mt-2" type="link" onClick={() => navigate("/tutor")}>现在开始</Button></div> : <div className="divide-y divide-slate-100 border-t border-slate-100">
            {(teacher ? keypoints.map(([name, count]) => ({ name, count })) : learning?.focus_keypoints || []).map((item, index) => <button key={item.name} onClick={() => navigate(`/questions?keypoint=${encodeURIComponent(item.name)}`)} className="focus-row group"><span className="focus-index">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-700 group-hover:text-teal-900">{item.name}</span><span className="text-sm text-slate-500">{item.count} 次</span></button>)}
          </div>}
        </div>

        <div className="editorial-panel">
          <h2 className="text-lg font-extrabold text-slate-900">快速开始</h2>
          <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
            <Quick icon={<MessageOutlined />} title="按题号问解析" desc="例如：请讲解 P000001" onClick={() => navigate("/tutor?prompt=请讲解 P000001")} />
            <Quick icon={<BulbOutlined />} title="推荐练习题" desc="按知识点和难度智能推荐" onClick={() => navigate("/tutor?mode=recommend")} />
            <Quick icon={<ExperimentOutlined />} title="参数化实验" desc="调节参数并运行概率统计模拟" onClick={() => navigate("/experiments")} />
            {!teacher && <Quick icon={<CheckSquareOutlined />} title="完成班级任务" desc="诊断、分组干预与迁移验证" onClick={() => navigate("/tasks")} />}
            {!teacher && <Quick icon={<NodeIndexOutlined />} title="查看学习路径" desc="掌握度、断层预警与下一步任务" onClick={() => navigate("/learning-path")} />}
            {teacher && <Quick icon={<RadarChartOutlined />} title="查看班级证据" desc="认知风险、干预分组与迁移验证" onClick={() => navigate("/classrooms")} />}
            {teacher && <Quick icon={<ReadOutlined />} title="设计一节课" desc="从题库选例题生成课堂方案" onClick={() => navigate("/teaching")} />}
            {!teacher && learning?.recent_sessions.slice(0, 1).map(item => <Quick key={item.id} icon={<ClockCircleOutlined />} title="继续最近学习" desc={item.title} onClick={() => navigate("/tutor")} />)}
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: number | string; note: string }) {
  return <div className="dashboard-stat"><div><p className="dashboard-stat-label">{label}</p><p className="dashboard-stat-value">{value}</p><p className="dashboard-stat-note">{note}</p></div><span className="dashboard-stat-icon">{icon}</span></div>;
}

function Quick({ icon, title, desc, onClick }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void }) {
  return <button onClick={onClick} className="quick-row group"><span className="quick-icon">{icon}</span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-800 group-hover:text-teal-950">{title}</span><span className="mt-0.5 block truncate text-sm text-slate-500 group-hover:text-teal-800">{desc}</span></span><ArrowRightOutlined className="quick-arrow" /></button>;
}

function ProbabilitySketch() {
  return <svg className="probability-sketch" viewBox="0 0 360 145" role="img" aria-label="概率密度曲线">
    <path className="sketch-grid" d="M24 22v98h316M24 95h316M24 70h316M24 45h316M87 22v98M150 22v98M213 22v98M276 22v98" />
    <path className="sketch-area" d="M25 118C58 117 91 111 117 92c28-21 33-61 69-65 40-5 45 56 78 72 22 11 50 17 75 19v2H25z" />
    <path className="sketch-curve" d="M25 118C58 117 91 111 117 92c28-21 33-61 69-65 40-5 45 56 78 72 22 11 50 17 75 19" />
    <path className="sketch-marker" d="M186 27v93" />
    <circle cx="186" cy="27" r="4" />
    <text x="194" y="21">μ</text><text x="322" y="137">x</text><text x="10" y="22">f(x)</text>
  </svg>;
}
