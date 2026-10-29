import { Alert, Button, Form, Input, Typography } from "antd";
import { useState } from "react";

import { api } from "../../api/client.js";
import Brand from "../../Brand.js";
import { useI18n } from "../../LanguageProvider.js";

export default function AuthPage({ setup, onReady }: { setup: boolean; onReady: () => void }) {
  const { t, errorText } = useI18n();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (values: Record<string, string>) => {
    setBusy(true);
    setError("");
    try {
      await api(setup ? "/setup/admin" : "/auth/login", "POST", values);
      onReady();
    } catch (error) {
      setError(error instanceof Error ? error.message : "NETWORK_ERROR");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <aside className="auth-intro">
        <Brand />
        <div className="auth-verse">
          <span>{t("brand.verseFirst")}</span>
          <span>{t("brand.verseSecond")}</span>
        </div>
        <p>{t("auth.motto")}</p>
      </aside>
      <section className="auth-card">
        <div className="eyebrow">{t("auth.brand")}</div>
        <Typography.Title level={2}>{setup ? t("auth.motto") : t("auth.welcome")}</Typography.Title>
        <p className="muted">{setup ? t("auth.setupIntro") : t("auth.loginIntro")}</p>
        {error && <Alert showIcon title={errorText(error)} type="error" />}
        <Form<Record<string, string>> layout="vertical" requiredMark={false} onFinish={values => void submit(values)}>
          {setup && (
            <Form.Item
              label={t("auth.token")}
              name="setupToken"
              rules={[{ required: true, message: t("auth.tokenRequired") }]}
            >
              <Input.Password autoComplete="off" placeholder={t("auth.tokenHint")} />
            </Form.Item>
          )}
          <Form.Item
            label={t("auth.username")}
            name="username"
            rules={[{ required: true, message: t("auth.usernameRequired") }]}
          >
            <Input autoComplete="username" maxLength={64} />
          </Form.Item>
          <Form.Item
            label={t("auth.password")}
            name="password"
            rules={[
              { required: true, message: t("auth.passwordRequired") },
              ...(setup ? [{ min: 12, message: t("account.rule") }] : []),
            ]}
          >
            <Input.Password autoComplete={setup ? "new-password" : "current-password"} maxLength={128} />
          </Form.Item>
          <Button block htmlType="submit" loading={busy} size="large" type="primary">
            {setup ? t("auth.create") : t("auth.login")}
          </Button>
        </Form>
        <p className="auth-footnote">{t("auth.footnote")}</p>
      </section>
    </main>
  );
}
