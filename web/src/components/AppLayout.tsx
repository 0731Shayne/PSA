import { useState, type ReactNode } from "react";
import { Avatar, Button, Drawer, Dropdown, Menu, Popconfirm, Tooltip, message } from "antd";
import type { MenuProps } from "antd";
import { BookOutlined, CheckSquareOutlined, DatabaseOutlined, ExperimentOutlined, HomeOutlined, LockOutlined, LogoutOutlined, MenuOutlined, MessageOutlined, NodeIndexOutlined, RadarChartOutlined, ReadOutlined, ReloadOutlined, SwapOutlined, UserOutlined } from "@ant-design/icons";
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
  const menuItems: MenuProps["items"] = nav.map(item => ({ key: item.path, label: item.shortLabel }));
  const drawerMenuItems: MenuProps["items"] = nav.map(item => ({ key: item.path, icon: item.icon, label: item.label }));
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
        <span className="brand-subtitle block">PROBABILITY &amp; STATISTICS</span>
      </span>
    </button>
  );

  return (
    <div className={`app-shell ${/^\/tasks\/\d+/.test(location.pathname) ? "task-focus-shell" : ""}`}>
      <a href="#main-content" className="skip-link">跳到主要内容</a>
      {isDemo && <div className="demo-banner">
          <span><strong>模拟演示</strong><span className="hidden sm:inline"> · 当前操作只保存在你的浏览器，不会影响真实数据</span></span>
          <div className="flex items-center gap-1">
            <Button type="text" size="small" icon={<SwapOutlined />} onClick={switchDemoRole}>切换到{teacher ? "学生" : "教师"}端</Button>
            <Popconfirm title="重置演示数据？" description="当前浏览器中的演示操作将恢复到初始状态。" okText="重置" cancelText="取消" onConfirm={resetDemo}><Button type="text" size="small" icon={<ReloadOutlined />}>重置</Button></Popconfirm>
          </div>
        </div>}
      <header className="app-topbar">
        <div className="app-topbar-inner">
          <div className="app-brand-wrap">{brand}</div>
          <Menu mode="horizontal" selectedKeys={[current.path]} items={menuItems} onClick={selectMenu} className="topbar-menu" />
          <div className="topbar-actions">
            <Button className="topbar-menu-trigger" type="text" icon={<MenuOutlined />} onClick={() => setMobileOpen(true)} aria-label="打开导航" />
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
          </div>
        </div>
      </header>
      <main id="main-content" className="app-content" tabIndex={-1}>{children}</main>

      <nav className="mobile-tabbar" aria-label="主导航">
        {mobileNav.map(item => { const active = location.pathname.startsWith(item.path); return <Tooltip key={item.path} title={item.label}><button onClick={() => go(item.path)} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>{item.icon}<span>{item.shortLabel}</span></button></Tooltip>; })}
      </nav>

      <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} placement="left" width={286} title="课程导航" styles={{ body: { padding: 0 } }}>
        <div className="px-5 py-5">{brand}</div>
        <Menu mode="inline" selectedKeys={[current.path]} items={drawerMenuItems} onClick={selectMenu} className="app-menu" />
      </Drawer>
    </div>
  );
}
