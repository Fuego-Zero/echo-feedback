import { App as AntApp, Button, Dropdown, Form, Input, Modal, Result, Spin } from "antd";
import { useCallback, useEffect, useState } from "react";

import { api } from "./api/client.js";
import Brand from "./Brand.js";
import AuthPage from "./features/auth/AuthPage.js";
import FeedbackPage from "./features/feedback/FeedbackPage.js";
import ProjectsPage from "./features/projects/ProjectsPage.js";

export default function App() {
  const { message } = AntApp.useApp();
  const [session, setSession] = useState<{ username: string | null; setup: boolean }>();
  const [error, setError] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [section, setSection] = useState("feedback");
  const load = useCallback(async () => {
    try {
      const [user, setup] = await Promise.all([
        api<{ username: string | null }>("/auth/session"),
        api<{ needed: boolean }>("/setup/status"),
      ]);
      setError("");
      setSession({ username: user.username, setup: setup.needed });
    } catch (error) {
      setError((error as Error).message);
    }
  }, []);
  useEffect(() => {
    // 首次异步请求完成后更新会话，不由派生状态触发。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const expire = () => setSession({ username: null, setup: false });
    window.addEventListener("echo:auth-expired", expire);
    return () => window.removeEventListener("echo:auth-expired", expire);
  }, [load]);
  if (error) {
    return (
      <Result
        className="connection-state"
        extra={<Button onClick={() => void load()}>重试</Button>}
        status="warning"
        subTitle={error}
        title="暂时无法连接回声"
      />
    );
  }

  if (!session) {
    return <Spin fullscreen description="正在连接回声…" />;
  }

  if (!session.username) {
    return <AuthPage setup={session.setup} onReady={() => void load()} />;
  }

  const logout = async () => {
    try {
      await api("/auth/logout", "POST");
      await load();
    } catch (error) {
      void message.error((error as Error).message);
    }
  };

  const changePassword = async (values: Record<string, string>) => {
    try {
      await api("/auth/password", "PUT", values);
      setPasswordOpen(false);
      void message.success("密码已更新，请重新登录");
      await load();
    } catch (error) {
      void message.error((error as Error).message);
    }
  };

  return (
    <div className="workspace">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-caption">收录心声 · 静候回响</div>
        <nav aria-label="主导航">
          <Button
            type="text"
            aria-current={section === "feedback" ? "page" : undefined}
            onClick={() => setSection("feedback")}
          >
            反馈收件箱
          </Button>
          <Button
            type="text"
            aria-current={section === "projects" ? "page" : undefined}
            onClick={() => setSection("projects")}
          >
            项目接入
          </Button>
        </nav>
        <div className="sidebar-foot">
          让每个声音，
          <br />
          被听见。
        </div>
      </aside>
      <div className="workspace-content">
        <header className="topbar">
          <span className="current-page">{section === "feedback" ? "反馈收件箱" : "项目接入"}</span>
          <div className="account">
            <span className="muted">{session.username}</span>
            <Button type="text" onClick={() => setPasswordOpen(true)}>
              修改密码
            </Button>
            <Button type="text" onClick={() => void logout()}>
              退出
            </Button>
          </div>
          <div className="account-mobile">
            <Dropdown
              menu={{
                items: [
                  { key: "password", label: "修改密码" },
                  { key: "logout", label: "退出" },
                ],
                onClick: ({ key }) => (key === "password" ? setPasswordOpen(true) : void logout()),
              }}
              trigger={["click"]}
            >
              <Button aria-label="账号操作">{session.username} ▾</Button>
            </Dropdown>
          </div>
        </header>
        <main className="workspace-main">{section === "feedback" ? <FeedbackPage /> : <ProjectsPage />}</main>
        <footer className="workspace-footer">回声 · 让产品与用户，保持对话。</footer>
      </div>
      <Modal destroyOnHidden footer={null} open={passwordOpen} title="修改密码" onCancel={() => setPasswordOpen(false)}>
        <Form<Record<string, string>> layout="vertical" onFinish={values => void changePassword(values)}>
          <Form.Item label="当前密码" name="currentPassword" rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            label="新密码"
            name="newPassword"
            rules={[{ required: true, min: 12, message: "至少 12 位，包含字母和数字" }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button htmlType="submit" type="primary">
            更新密码
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
