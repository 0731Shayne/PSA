import { useEffect, useState } from "react";
import { Alert, Button, Form, Input, Segmented, message } from "antd";
import { ArrowRightOutlined, BookOutlined, CodeOutlined, DatabaseOutlined, ExperimentOutlined, LockOutlined, ReadOutlined, TeamOutlined, UserOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/api/client";
import { BrandMark } from "@/components/BrandMark";

export default function LoginPage() {
  const staticPreview = import.meta.env.VITE_STATIC_PREVIEW === "true";
  const [form] = Form.useForm();
  const selectedRole = Form.useWatch("role", form);
  const { user, login, enterDemo } = useAuth();
  const navigate = useNavigate();
  const [register, setRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [devLoginEnabled, setDevLoginEnabled] = useState(false);
  const [devLoginRole, setDevLoginRole] = useState<"student" | "teacher">("teacher");
  const [devLoading, setDevLoading] = useState(false);
  useEffect(() => { if (user) navigate("/dashboard", { replace: true }); }, [user, navigate]);
  useEffect(() => {
    if (staticPreview) return;
    apiClient.get<{ enabled: boolean; role?: "student" | "teacher" }>("/api/auth/dev-login/status")
      .then(res => {
        setDevLoginEnabled(Boolean(res.data.enabled));
        setDevLoginRole(res.data.role === "student" ? "student" : "teacher");
      })
      .catch(() => setDevLoginEnabled(false));
  }, [staticPreview]);

  async function submit(values: { username: string; password: string; name?: string; role?: string; teacher_code?: string }) {
    if (staticPreview) {
      message.info("这是静态前端预览，登录与业务功能需要连接 FastAPI 后端");
      return;
    }
    setLoading(true);
    try {
      await apiClient.post(register ? "/api/auth/register" : "/api/auth/login", values);
      await login();
      navigate("/dashboard", { replace: true });
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      message.error(detail || "登录失败，请检查账号信息");
    } finally { setLoading(false); }
  }

  async function devLogin() {
    setDevLoading(true);
    try {
      await apiClient.post("/api/auth/dev-login");
      await login();
      navigate("/dashboard", { replace: true });
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      message.error(detail || "开发者登录未启用");
    } finally {
      setDevLoading(false);
    }
  }

  function startDemo(role: "student" | "teacher") {
    enterDemo(role);
    navigate("/dashboard", { replace: true });
  }

  return (
    <div className="login-page">
      <header className="login-header">
        <div className="login-header-inner">
          <div className="login-brand"><BrandMark /><div><div>概率统计教学平台</div><p>概率论与数理统计课程平台</p></div></div>
          <nav className="login-nav" aria-label="登录页导航">
            <a href="#platform">平台介绍</a>
            <a href="#features">课程能力</a>
            <a href="#distribution">概率图谱</a>
            <a className="login-nav-action" href="#login-entry">进入平台</a>
          </nav>
        </div>
      </header>
      <main className="login-layout" id="platform">
        <section className="login-story">
          <p className="login-eyebrow">PROBABILITY &amp; STATISTICS ASSISTANT</p>
          <p className="login-intro">面向概率论与数理统计课程的学习与教学平台。连接专属题库、循序答疑、概率实验和真实学习证据。</p>
          <div className="login-features" id="features">
            <Feature title="1007 道课程题目" icon={<DatabaseOutlined />} />
            <Feature title="交互式概率实验" icon={<ExperimentOutlined />} />
            <Feature title="分层教学设计" icon={<ReadOutlined />} />
          </div>
          <div className="login-card" id="login-entry">
            <div className="login-card-heading"><p>{staticPreview ? "在线产品演示" : "WELCOME BACK"}</p><h2>{staticPreview ? "选择一个视角开始体验" : register ? "创建账号" : "登录教学平台"}</h2><span>{staticPreview ? "无需账号，演示数据只保存在当前浏览器" : register ? "选择使用身份，进入对应工作台" : "使用你的课程平台账号继续"}</span></div>
            {staticPreview ? <>
              <Alert className="mb-5" showIcon type="info" message="这是模拟数据演示" description="你可以浏览全部页面并体验主要交互；数据仅保存在当前浏览器。" />
              <div className="grid gap-3 sm:grid-cols-2">
                <button onClick={() => startDemo("teacher")} className="demo-role-button group" aria-label="进入教师端演示">
                  <span className="demo-role-icon primary"><TeamOutlined /></span>
                  <span className="min-w-0 flex-1"><span className="block font-bold text-slate-900">教师端演示</span><span className="mt-1 block text-xs leading-5 text-slate-500">班级与分层教学</span></span>
                  <ArrowRightOutlined className="demo-role-arrow" />
                </button>
                <button onClick={() => startDemo("student")} className="demo-role-button group" aria-label="进入学生端演示">
                  <span className="demo-role-icon"><BookOutlined /></span>
                  <span className="min-w-0 flex-1"><span className="block font-bold text-slate-900">学生端演示</span><span className="mt-1 block text-xs leading-5 text-slate-500">任务与学习路径</span></span>
                  <ArrowRightOutlined className="demo-role-arrow" />
                </button>
              </div>
            </> : <>
              <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} initialValues={{ role: "student" }}>
                <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }]}><Input size="large" prefix={<UserOutlined />} placeholder="请输入用户名" autoComplete="username" maxLength={64} /></Form.Item>
                {register && <Form.Item name="name" label="姓名"><Input size="large" placeholder="你的姓名或昵称" maxLength={64} /></Form.Item>}
                {register && <Form.Item name="role" label="使用身份"><Segmented block options={[{ label: "我是学生", value: "student" }, { label: "我是教师", value: "teacher" }]} /></Form.Item>}
                {register && selectedRole === "teacher" && <Form.Item name="teacher_code" label="教师邀请码" rules={[{ required: true, message: "请输入教师邀请码" }]}><Input.Password size="large" prefix={<LockOutlined />} placeholder="由系统部署方提供" /></Form.Item>}
                <Form.Item name="password" label="密码" rules={[{ required: true, min: 8, message: "密码至少 8 位" }]}><Input.Password size="large" prefix={<LockOutlined />} placeholder="请输入密码" autoComplete={register ? "new-password" : "current-password"} maxLength={128} /></Form.Item>
                <Button htmlType="submit" type="primary" block size="large" loading={loading} className="mt-2 !h-12 !font-bold">{register ? "注册并进入" : "登录"}</Button>
              </Form>
              {!register && devLoginEnabled && (
                <>
                  <div className="my-5 flex items-center gap-3 text-sm text-slate-500"><span className="h-px flex-1 bg-slate-100" />本地开发环境<span className="h-px flex-1 bg-slate-100" /></div>
                  <Button block size="large" icon={<CodeOutlined />} loading={devLoading} disabled={loading} onClick={devLogin} className="!h-11 !font-bold">
                    一键进入本地{devLoginRole === "student" ? "学生" : "教师"}端
                  </Button>
                </>
              )}
              <div className="login-register-switch">{register ? "已有账号？" : "还没有账号？"}<button onClick={() => setRegister(v => !v)}>{register ? "直接登录" : "立即注册"}</button></div>
            </>}
          </div>
        </section>
        <ProbabilityHeroFigure />
      </main>
      <footer className="login-footer">PSA · 概率论与数理统计课程支持</footer>
    </div>
  );
}

function Feature({ title, icon }: { title: string; icon: React.ReactNode }) {
  return <div className="login-feature"><span>{icon}</span><h3>{title}</h3></div>;
}

function ProbabilityHeroFigure() {
  return <figure className="probability-hero" id="distribution">
    <div className="probability-plot">
      <div className="plot-heading"><span>经典分布</span><strong>正态分布 N(μ, σ²)</strong></div>
      <svg viewBox="0 0 640 500" role="img" aria-labelledby="normal-title normal-desc">
        <title id="normal-title">正态分布概率密度函数图</title>
        <desc id="normal-desc">以均值为中心的钟形概率密度曲线，并标出正负一个标准差的区间。</desc>
        <defs>
          <linearGradient id="normal-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity=".5" /><stop offset="1" stopColor="#ffffff" stopOpacity=".04" /></linearGradient>
          <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="16" stdDeviation="18" floodColor="#10136a" floodOpacity=".22" /></filter>
        </defs>
        <g className="plot-grid"><path d="M56 78v342M144 78v342M232 78v342M320 78v342M408 78v342M496 78v342M584 78v342M56 420h528M56 334h528M56 248h528M56 162h528M56 78h528" /></g>
        <path className="plot-axis" d="M48 420h552M56 432V64" />
        <path className="plot-area" filter="url(#soft-shadow)" d="M56 420c59 0 106-7 145-41 43-38 61-120 88-208 10-34 19-59 31-59s21 25 31 59c27 88 45 170 88 208 39 34 86 41 145 41z" />
        <path className="plot-curve" d="M56 420c59 0 106-7 145-41 43-38 61-120 88-208 10-34 19-59 31-59s21 25 31 59c27 88 45 170 88 208 39 34 86 41 145 41" />
        <path className="plot-guide" d="M232 420V250M320 420V112M408 420V250" />
        <circle className="plot-point" cx="320" cy="112" r="5" />
        <g className="plot-labels"><text x="219" y="447">μ − σ</text><text x="314" y="447">μ</text><text x="395" y="447">μ + σ</text><text x="572" y="447">x</text><text x="23" y="79">f(x)</text></g>
      </svg>
      <div className="plot-formula"><span>f(x) =</span><strong>1 / (σ√2π) · e<sup>−(x−μ)² / 2σ²</sup></strong></div>
      <div className="plot-note"><span>μ</span> 决定中心位置 <i /> <span>σ</span> 决定曲线离散程度</div>
    </div>
    <figcaption>用可视化连接公式、分布与直觉</figcaption>
  </figure>;
}
