import { useState, type ReactNode } from "react";
import { Avatar, Button, Drawer, Dropdown, Menu, Popconfirm, Tooltip, message } from "antd";
import type { MenuProps } from "antd";
import { BookOutlined, CheckSquareOutlined, DatabaseOutlined, ExperimentOutlined, HomeOutlined, LockOutlined, LogoutOutlined, MenuOutlined, MessageOutlined, NodeIndexOutlined, RadarChartOutlined, ReadOutlined, ReloadOutlined, RightOutlined, SwapOutlined, UserOutlined } from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { resetDemoData } from "@/demo/demoApi";
import { BrandMark } from "@/components/BrandMark";
import { confirmUnsavedNavigation } from "@/utils/unsavedChanges";

const items = [
  { path: "/dashboard", label: "学习工作台", shortLabel: "工作台", icon: <HomeOutlined /> },
  { path: "/tutor", label: "智能答疑", shortLabel: "答疑", icon: <MessageOutlined /> },
  { path: "/questions", label: "课程题库", shortLabel: "题库", icon: <BookOutlined /> },
  { path: "/experiments", label: "概率实验室", shortLabel: "实验", icon: <ExperimentOutlined /> },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout, isDemo, enterDemo } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const teacher = user?.role === "teacher";
  const classroomItem = { path: "/classrooms", label: "班级认知雷达", shortLabel: "班级", icon: <RadarChartOutlined /> };
  const taskItem = { path: "/tasks", label: "我的任务", shortLabel: "任务", icon: <CheckSquareOutlined /> };
  const teachingItem = { path: "/teaching", label: "分层教学包", shortLabel: "教学", icon: <ReadOutlined /> };
  const knowledgeItem = { path: "/knowledge", label: "课程资料库", shortLabel: "资料", icon: <DatabaseOutlined /> };
  const pathItem = { path: "/learning-path", label: "学习路径", shortLabel: "路径", icon: <NodeIndexOutlined /> };
  const nav = teacher
    ? [items[0], classroomItem, teachingItem, knowledgeItem, ...items.slice(1)]
    : [items[0], taskItem, ...items.slice(1), pathItem];
  const mobileNav = teacher
    ? [items[0], classroomItem, knowledgeItem, items[1], items[2]]
    : [items[0], taskItem, items[1], items[2], pathItem];
  const current = nav.find(item => location.pathname.startsWith(item.path)) || nav[0];
  const menuItems: MenuProps["items"] = nav.map(item => ({ key: item.path, icon: item.icon, label: item.label }));
  const accountItems: MenuProps["items"] = [
    { key: "identity", type: "group", label: teacher ? "教师账号" : "学生账号", children: [{ key: "profile", icon: <UserOutlined />, label: user?.name || "个人账号", disabled: true }, { key: "security", icon: <LockOutlined />, label: "账号与安全" }] },
    { type: "divider" },
    { key: "logout", icon: <LogoutOutlined />, label: isDemo ? "退出演示" : "退出登录", danger: true },
  ];

  function go(path: string) {
    if (confirmUnsavedNavigation()) navigate(path);
  }

  function selectMenu({ key }: { key: string }) {
    if (!confirmUnsavedNavigation()) return;
    navigate(key);
    setMobileOpen(false);
  }

  async function signOut() {
    if (!confirmUnsavedNavigation()) return;
    await logout();
    navigate("/login");
  }

  function switchDemoRole() {
    if (!confirmUnsavedNavigation()) return;
    enterDemo(teacher ? "student" : "teacher");
    navigate("/dashboard");
    message.success(`已切换到${teacher ? "学生" : "教师"}端演示`);
  }

  function resetDemo() {
    resetDemoData();
    message.success("演示数据已恢复为初始状态");
    window.location.reload();
  }

  const brand = (
    <button onClick={() => go("/dashboard")} className="brand-button" aria-label="返回学习工作台">
      <BrandMark />
      <span className="min-w-0 text-left">
        <span className="brand-title block truncate">概率统计教学助手</span>
        <span className="brand-subtitle block">概率论与数理统计</span>
      </span>
    </button>
  );

  return (
    <div className={`app-shell ${/^\/tasks\/\d+/.test(location.pathname) ? "task-focus-shell" : ""}`}>
      <a href="#main-content" className="skip-link">跳到主要内容</a>
      <aside className="app-sidebar">
        <div className="px-5 py-6">{brand}</div>
        <div className="course-library-card mx-4 mb-4 rounded-2xl p-3.5">
          <div className="course-card-index">课程资源</div>
          <div className="course-card-title">专属课程题库</div>
          <p>1007 道概率统计题目与解析</p>
        </div>
        <p className="sidebar-section-label px-6 pb-2 pt-2">课程导航</p>
        <Menu mode="inline" selectedKeys={[current.path]} items={menuItems} onClick={selectMenu} className="app-menu" />
        <div className="mt-auto p-4">
          <div className="study-tip rounded-2xl p-4">
            <p className="study-tip-label">课堂札记</p>
            <p className="study-tip-copy">{teacher ? "先查看作答依据，再安排下一次练习。" : "先独立作答，再用提示检查思路。"}</p>
            <button onClick={() => go("/tutor")} className="study-tip-link">开始提问 <RightOutlined className="text-xs" /></button>
          </div>
        </div>
      </aside>

      <div className="app-workspace">
        {isDemo && <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950 sm:px-6">
          <span><strong>模拟演示</strong><span className="hidden sm:inline"> · 当前操作只保存在你的浏览器，不会影响真实数据</span></span>
          <div className="flex items-center gap-1">
            <Button type="text" size="small" icon={<SwapOutlined />} onClick={switchDemoRole}>切换到{teacher ? "学生" : "教师"}端</Button>
            <Popconfirm title="重置演示数据？" description="当前浏览器中的演示操作将恢复到初始状态。" okText="重置" cancelText="取消" onConfirm={resetDemo}><Button type="text" size="small" icon={<ReloadOutlined />}>重置</Button></Popconfirm>
          </div>
        </div>}
        <header className="app-header">
          <div className="flex min-w-0 items-center gap-3">
            <Button className="!flex xl:!hidden" type="text" icon={<MenuOutlined />} onClick={() => setMobileOpen(true)} aria-label="打开导航" />
            <div className="min-w-0">
              <div className="workspace-kicker">{teacher ? "教师工作空间" : "学生学习空间"}</div>
              <div className="workspace-title">{current.label}</div>
            </div>
          </div>
          <Dropdown
            menu={{ items: accountItems, onClick: ({ key }) => { if (key === "logout") void signOut(); else if (key === "security") go("/account/security"); } }}
            placement="bottomRight"
            trigger={["click"]}
          >
            <button className="account-button" aria-label={`打开${user?.name || "用户"}的账号菜单`}>
              <Avatar className="account-avatar">{user?.name?.[0] || "用"}</Avatar>
              <span className="hidden text-left sm:block"><span className="account-name">{user?.name}</span><span className="account-role">{teacher ? "教师端" : "学生端"}</span></span>
            </button>
          </Dropdown>
        </header>
        <main id="main-content" className="app-content" tabIndex={-1}>{children}</main>
      </div>

      <nav className="mobile-tabbar" aria-label="主导航">
        {mobileNav.map(item => { const active = location.pathname.startsWith(item.path); return <Tooltip key={item.path} title={item.label}><button onClick={() => go(item.path)} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>{item.icon}<span>{item.shortLabel}</span></button></Tooltip>; })}
      </nav>

      <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} placement="left" width={286} title="课程导航" styles={{ body: { padding: 0 } }}>
        <div className="px-5 py-5">{brand}</div>
        <Menu mode="inline" selectedKeys={[current.path]} items={menuItems} onClick={selectMenu} className="app-menu" />
      </Drawer>
    </div>
  );
}
