import { App as AntApp, Button, Dropdown, Form, Input, Modal, Result, Spin } from "antd";
import { useCallback, useEffect, useState } from "react";

import { api } from "./api/client.js";
import Brand from "./Brand.js";
import AuthPage from "./features/auth/AuthPage.js";
import FeedbackPage from "./features/feedback/FeedbackPage.js";
import ProjectsPage from "./features/projects/ProjectsPage.js";
import { useI18n } from "./LanguageProvider.js";
import LanguageSelect from "./LanguageSelect.js";

export default function App() {
  const { t, errorText } = useI18n();
  const { message } = AntApp.useApp();
  const [session, setSession] = useState<{ username: string | null; setup: boolean }>();
  const [error, setError] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [section, setSection] = useState("feedback");
  const [compactNavigation, setCompactNavigation] = useState(() => window.matchMedia("(max-width: 1023px)").matches);
  useEffect(() => {
    // 语言入口跟随导航实际所在行，只渲染一个可访问的菜单。
    const media = window.matchMedia("(max-width: 1023px)");
    const changed = () => setCompactNavigation(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
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
      <>
        <div className="language-toolbar">
          <LanguageSelect />
        </div>
        <Result
          className="connection-state"
          extra={<Button onClick={() => void load()}>{t("common.retry")}</Button>}
          status="warning"
          subTitle={errorText(error)}
          title={t("connection.title")}
        />
      </>
    );
  }

  if (!session) {
    return (
      <>
        <div className="language-toolbar">
          <LanguageSelect />
        </div>
        <Spin fullscreen description={t("connection.pending")} />
      </>
    );
  }

  if (!session.username) {
    return (
      <>
        <div className="language-toolbar">
          <LanguageSelect />
        </div>
        <AuthPage setup={session.setup} onReady={() => void load()} />
      </>
    );
  }

  const logout = async () => {
    try {
      await api("/auth/logout", "POST");
      await load();
    } catch (error) {
      void message.error(errorText((error as Error).message));
    }
  };

  const changePassword = async (values: Record<string, string>) => {
    try {
      await api("/auth/password", "PUT", values);
      setPasswordOpen(false);
      void message.success(t("account.updated"));
      await load();
    } catch (error) {
      void message.error(errorText((error as Error).message));
    }
  };

  return (
    <div className="workspace">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-caption">{t("nav.caption")}</div>
        <div className="sidebar-navigation">
          <nav aria-label={t("nav.label")}>
            <Button
              type="text"
              aria-current={section === "feedback" ? "page" : undefined}
              onClick={() => setSection("feedback")}
            >
              {t("nav.inbox")}
            </Button>
            <Button
              type="text"
              aria-current={section === "projects" ? "page" : undefined}
              onClick={() => setSection("projects")}
            >
              {t("nav.projects")}
            </Button>
          </nav>
          {compactNavigation && (
            <div className="sidebar-language">
              <LanguageSelect />
            </div>
          )}
        </div>
        <div className="sidebar-foot">
          {t("brand.sideFirst")}
          <br />
          {t("brand.sideSecond")}
        </div>
      </aside>
      <div className="workspace-content">
        <header className="topbar">
          <span className="current-page">{section === "feedback" ? t("nav.inbox") : t("nav.projects")}</span>
          <div className="account">
            <span className="muted">{session.username}</span>
            <Button type="text" onClick={() => setPasswordOpen(true)}>
              {t("account.password")}
            </Button>
            <Button type="text" onClick={() => void logout()}>
              {t("account.logout")}
            </Button>
          </div>
          <div className="account-mobile">
            <Dropdown
              menu={{
                items: [
                  { key: "password", label: t("account.password") },
                  { key: "logout", label: t("account.logout") },
                ],
                onClick: ({ key }) => (key === "password" ? setPasswordOpen(true) : void logout()),
              }}
              trigger={["click"]}
            >
              <Button aria-label={t("account.actions")}>{session.username} ▾</Button>
            </Dropdown>
          </div>
          {!compactNavigation && (
            <div className="topbar-language">
              <LanguageSelect />
            </div>
          )}
        </header>
        <main className="workspace-main">{section === "feedback" ? <FeedbackPage /> : <ProjectsPage />}</main>
        <footer className="workspace-footer">{t("brand.footer")}</footer>
      </div>
      <Modal
        destroyOnHidden
        footer={null}
        open={passwordOpen}
        title={t("account.password")}
        onCancel={() => setPasswordOpen(false)}
      >
        <Form<Record<string, string>> layout="vertical" onFinish={values => void changePassword(values)}>
          <Form.Item label={t("account.current")} name="currentPassword" rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            label={t("account.new")}
            name="newPassword"
            rules={[{ required: true, min: 12, message: t("account.rule") }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button htmlType="submit" type="primary">
            {t("account.update")}
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
