import type { ReactNode } from "react";
import { Spin } from "antd";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";


export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex min-h-screen items-center justify-center" aria-live="polite"><Spin tip="正在验证登录状态"><div className="h-12 w-44" /></Spin></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password && location.pathname !== "/account/security") {
    return <Navigate to="/account/security" replace />;
  }
  return <>{children}</>;
}
