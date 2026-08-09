import { useEffect, useState } from "react";
import { Alert, Button, Form, Input, Segmented, message } from "antd";
import { ArrowRightOutlined, BookOutlined, CheckCircleOutlined, CodeOutlined, DatabaseOutlined, LockOutlined, ReadOutlined, TeamOutlined, UserOutlined } from "@ant-design/icons";
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
          <div className="login-brand"><BrandMark /><div><div>概率统计教学助手</div><p>概率论与数理统计课程平台</p></div></div>
          <div className="login-library"><BookOutlined /> COURSE ARCHIVE · 1007</div>
        </div>
      </header>
      <main className="login-layout">
        <section className="login-story">
          <div className="login-story-index"><span>PSA · 2026</span><span>教学版</span></div>
          <p className="login-eyebrow">为大学概率统计课程而设计</p>
          <h1>从题库出发，<br />把解题与教学讲清楚</h1>
          <p className="login-intro">学生循序解题，教师沉淀课堂设计。每一步都来自课程题库与真实学习证据。</p>
          <DistributionFigure />
          <div className="login-features">
            <Feature title="1007 道专属题目" icon={<DatabaseOutlined />} />
            <Feature title="循序分步辅导" icon={<CheckCircleOutlined />} />
            <Feature title="可编辑教学设计" icon={<ReadOutlined />} />
          </div>
        </section>
        <section className="login-entry">
          <div className="login-card">
          <div className="login-card-heading"><p>{staticPreview ? "在线产品演示" : "账号入口"}</p><h2>{staticPreview ? "选择一个视角开始体验" : register ? "创建账号" : "登录教学平台"}</h2><span>{staticPreview ? "无需账号，演示数据不会上传或影响其他访客" : register ? "选择使用身份，进入对应工作台" : "使用你的课程平台账号继续"}</span></div>
          {staticPreview ? <>
            <Alert className="mb-5" showIcon type="info" message="这是模拟数据演示" description="你可以浏览全部页面并体验主要交互；数据仅保存在当前浏览器。" />
            <div className="space-y-3">
              <button onClick={() => startDemo("teacher")} className="demo-role-button group">
                <span className="demo-role-icon primary"><TeamOutlined /></span>
                <span className="min-w-0 flex-1"><span className="block font-extrabold text-slate-900">进入教师端演示</span><span className="mt-1 block text-sm leading-5 text-slate-500">班级雷达、分组干预与分层教学包</span></span>
                <ArrowRightOutlined className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-teal-700" />
              </button>
              <button onClick={() => startDemo("student")} className="demo-role-button group">
                <span className="demo-role-icon"><BookOutlined /></span>
                <span className="min-w-0 flex-1"><span className="block font-extrabold text-slate-900">进入学生端演示</span><span className="mt-1 block text-sm leading-5 text-slate-500">班级任务、题库答疑与个性化学习路径</span></span>
                <ArrowRightOutlined className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-teal-700" />
              </button>
            </div>
            <p className="mt-5 text-center text-sm leading-6 text-slate-500">进入后可随时切换角色或重置演示数据</p>
          </> : <>
          <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} initialValues={{ role: "student" }}>
            <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }]}><Input size="large" prefix={<UserOutlined />} placeholder="请输入用户名" autoComplete="username" maxLength={64} /></Form.Item>
            {register && <Form.Item name="name" label="姓名"><Input size="large" placeholder="你的姓名或昵称" maxLength={64} /></Form.Item>}
            {register && <Form.Item name="role" label="使用身份"><Segmented block options={[{ label: "我是学生", value: "student" }, { label: "我是教师", value: "teacher" }]} /></Form.Item>}
            {register && selectedRole === "teacher" && <Form.Item name="teacher_code" label="教师邀请码" rules={[{ required: true, message: "请输入教师邀请码" }]}><Input.Password size="large" prefix={<LockOutlined />} placeholder="由系统部署方提供" /></Form.Item>}
            <Form.Item name="password" label="密码" rules={[{ required: true, min: 8, message: "密码至少 8 位" }]}><Input.Password size="large" prefix={<LockOutlined />} placeholder="请输入密码" autoComplete={register ? "new-password" : "current-password"} maxLength={128} /></Form.Item>
            <Button htmlType="submit" type="primary" block size="large" loading={loading} className="mt-2 !h-12 !rounded-lg !font-bold">{register ? "注册并进入" : "登录"}</Button>
          </Form>
          {!register && devLoginEnabled && (
            <>
              <div className="my-5 flex items-center gap-3 text-sm text-slate-500"><span className="h-px flex-1 bg-slate-100" />本地开发环境<span className="h-px flex-1 bg-slate-100" /></div>
              <Button
                block
                size="large"
                icon={<CodeOutlined />}
                loading={devLoading}
                disabled={loading}
                onClick={devLogin}
                className="!h-11 !border-slate-200 !bg-slate-50 !font-bold !text-slate-600 hover:!border-teal-300 hover:!text-teal-800"
              >
                一键进入本地{devLoginRole === "student" ? "学生" : "教师"}端
              </Button>
              <p className="mt-2 text-center text-sm text-slate-500">使用本地{devLoginRole === "student" ? "学生" : "教师"}账号，仅开发环境显示</p>
            </>
          )}
          <div className="mt-7 border-t border-slate-100 pt-6 text-center text-sm text-slate-500">{register ? "已有账号？" : "还没有账号？"}<button onClick={() => setRegister(v => !v)} className="ml-2 font-bold text-teal-700">{register ? "直接登录" : "立即注册"}</button></div>
          </>}
        </div>
      </section>
      </main>
      <footer className="login-footer">概率统计教学助手 <span>·</span> 概率论与数理统计课程支持</footer>
    </div>
  );
}

function Feature({ title, icon }: { title: string; icon: React.ReactNode }) {
  return <div className="login-feature"><span>{icon}</span><h3>{title}</h3></div>;
}

function DistributionFigure() {
  return <div className="login-figure" aria-hidden="true"><svg viewBox="0 0 620 160"><path className="login-figure-grid" d="M5 130h610M67 15v115M188 15v115M309 15v115M430 15v115M551 15v115M5 95h610M5 60h610M5 25h610" /><path className="login-figure-area" d="M6 129c68-1 119-8 162-34 43-27 68-71 137-72 69-1 94 47 137 73 42 25 100 32 172 33z" /><path className="login-figure-curve" d="M6 129c68-1 119-8 162-34 43-27 68-71 137-72 69-1 94 47 137 73 42 25 100 32 172 33" /><path className="login-figure-line" d="M305 23v107" /><circle cx="305" cy="23" r="4" /><text x="315" y="18">E(X)</text><text x="581" y="148">x</text></svg></div>;
}
