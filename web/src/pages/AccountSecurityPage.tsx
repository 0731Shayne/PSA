import { useState } from "react";
import { Alert, Button, Form, Input, Result, message } from "antd";
import { LockOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { apiClient } from "@/api/client";
import { useAuth, type User } from "@/contexts/AuthContext";

interface PasswordValues {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

export default function AccountSecurityPage() {
  const { user, updateUser, isDemo } = useAuth();
  const [changing, setChanging] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [form] = Form.useForm<PasswordValues>();

  if (!user) return <Result status="403" title="请先登录" />;

  async function changePassword(values: PasswordValues) {
    if (isDemo) {
      message.info("演示账号不修改真实密码");
      return;
    }
    setChanging(true);
    try {
      const response = await apiClient.post<{ user: User }>("/api/auth/change-password", {
        current_password: values.current_password,
        new_password: values.new_password,
      });
      updateUser(response.data.user);
      form.resetFields();
      message.success("密码已更新，其他已登录设备已退出");
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      message.error(detail || "密码更新失败，请稍后重试");
    } finally {
      setChanging(false);
    }
  }

  async function revokeSessions() {
    if (isDemo) {
      message.info("演示账号没有其他登录设备");
      return;
    }
    setRevoking(true);
    try {
      const response = await apiClient.post<{ user: User }>("/api/auth/revoke-other-sessions");
      updateUser(response.data.user);
      message.success("其他设备的登录状态已全部失效");
    } catch {
      message.error("操作失败，请稍后重试");
    } finally {
      setRevoking(false);
    }
  }

  return <div className="mx-auto max-w-3xl">
    <div className="mb-6"><h1 className="text-2xl font-bold text-slate-950">账号与安全</h1><p className="mt-1 text-base text-slate-600">管理密码和已登录设备。当前账号：{user.username}</p></div>
    {user.must_change_password && <Alert className="mb-5" type="warning" showIcon message="首次登录必须修改初始密码" description="修改完成后才能继续使用课程功能；旧密码和其他设备上的登录状态会立即失效。" />}
    <section className="border border-slate-200 bg-white p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><LockOutlined className="text-teal-700" />修改密码</h2>
      <Form form={form} layout="vertical" className="mt-5 max-w-lg" onFinish={changePassword} requiredMark={false}>
        <Form.Item name="current_password" label="当前密码" rules={[{ required: true, message: "请输入当前密码" }]}><Input.Password autoComplete="current-password" /></Form.Item>
        <Form.Item name="new_password" label="新密码" rules={[{ required: true, message: "请输入新密码" }, { min: 8, message: "新密码至少 8 位" }]}><Input.Password autoComplete="new-password" /></Form.Item>
        <Form.Item name="confirm_password" label="再次输入新密码" dependencies={["new_password"]} rules={[{ required: true, message: "请再次输入新密码" }, ({ getFieldValue }) => ({ validator(_, value) { return !value || getFieldValue("new_password") === value ? Promise.resolve() : Promise.reject(new Error("两次输入的新密码不一致")); } })]}><Input.Password autoComplete="new-password" /></Form.Item>
        <Button type="primary" htmlType="submit" loading={changing}>保存新密码</Button>
      </Form>
    </section>
    <section className="mt-5 flex flex-wrap items-center justify-between gap-4 border border-slate-200 bg-white p-6">
      <div><h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><SafetyCertificateOutlined className="text-teal-700" />已登录设备</h2><p className="mt-2 text-sm leading-6 text-slate-600">如果怀疑账号在其他设备上仍保持登录，可以让所有其他会话立即失效；当前设备会继续保持登录。</p></div>
      <Button loading={revoking} onClick={revokeSessions}>退出其他设备</Button>
    </section>
  </div>;
}
