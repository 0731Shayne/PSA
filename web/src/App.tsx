import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { App as AntdApp, ConfigProvider, Spin } from "antd";
import zhCN from "antd/locale/zh_CN";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import AppErrorBoundary from "./components/AppErrorBoundary";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const TutorPage = lazy(() => import("./pages/TutorPage"));
const QuestionBankPage = lazy(() => import("./pages/QuestionBankPage"));
const TeachingStudio = lazy(() => import("./pages/TeachingStudio"));
const ExperimentLab = lazy(() => import("./pages/ExperimentLab"));
const LearningPathPage = lazy(() => import("./pages/LearningPathPage"));
const ClassroomRadarPage = lazy(() => import("./pages/ClassroomRadarPage"));
const MyTasksPage = lazy(() => import("./pages/MyTasksPage"));
const KnowledgeBasePage = lazy(() => import("./pages/KnowledgeBasePage"));
const TaskRunnerPage = lazy(() => import("./pages/TaskRunnerPage"));
const AccountSecurityPage = lazy(() => import("./pages/AccountSecurityPage"));

const protectedPage = (node: React.ReactNode) => (
  <ProtectedRoute><AppLayout>{node}</AppLayout></ProtectedRoute>
);

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}

export default function App() {
  const routerBase = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

  return (
    <BrowserRouter basename={routerBase}>
      <ConfigProvider
        locale={zhCN}
        theme={{
          token: {
            colorPrimary: "#3f46f4",
            colorInfo: "#3f46f4",
            colorSuccess: "#23856d",
            colorWarning: "#b7791f",
            colorError: "#d14343",
            colorBgLayout: "#f5f6fa",
            colorBgContainer: "#ffffff",
            colorText: "#1f2937",
            colorTextSecondary: "#667085",
            colorTextPlaceholder: "#98a2b3",
            colorBorder: "#e3e6ed",
            borderRadius: 8,
            borderRadiusLG: 12,
            controlHeight: 40,
            fontSizeSM: 13,
            fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif",
          },
          components: {
            Button: { fontWeight: 650, primaryShadow: "none", defaultShadow: "none" },
            Card: { headerFontSize: 16 },
            Drawer: { paddingLG: 24 },
            Menu: { itemBorderRadius: 6, itemHeight: 44, iconSize: 17 },
            Segmented: { itemSelectedBg: "#ffffff", trackBg: "#f0f2f7" },
            Table: { headerBg: "#f7f8fa", headerColor: "#344054" },
            Modal: { contentBg: "#ffffff", headerBg: "#ffffff" },
          },
        }}
      >
        <AntdApp>
          <AppErrorBoundary>
            <AuthProvider>
              <ScrollToTop />
              <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#f5f6fa]" aria-live="polite"><Spin size="large" tip="正在进入课程空间…"><div className="h-16 w-52" /></Spin></div>}>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/dashboard" element={protectedPage(<Dashboard />)} />
                  <Route path="/tutor" element={protectedPage(<TutorPage />)} />
                  <Route path="/questions" element={protectedPage(<QuestionBankPage />)} />
                  <Route path="/experiments" element={protectedPage(<ExperimentLab />)} />
                  <Route path="/learning-path" element={protectedPage(<LearningPathPage />)} />
                  <Route path="/classrooms" element={protectedPage(<ClassroomRadarPage />)} />
                  <Route path="/tasks" element={protectedPage(<MyTasksPage />)} />
                  <Route path="/tasks/:assignmentId" element={protectedPage(<TaskRunnerPage />)} />
                  <Route path="/teaching" element={protectedPage(<TeachingStudio />)} />
                  <Route path="/knowledge" element={protectedPage(<KnowledgeBasePage />)} />
                  <Route path="/account/security" element={protectedPage(<AccountSecurityPage />)} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </Suspense>
            </AuthProvider>
          </AppErrorBoundary>
        </AntdApp>
      </ConfigProvider>
    </BrowserRouter>
  );
}
