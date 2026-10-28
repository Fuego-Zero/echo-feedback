import { Alert, Button, Form, Input, Typography } from "antd";
import { useState } from "react";

import { api } from "../../api/client.js";
import Brand from "../../Brand.js";

export default function AuthPage({ setup, onReady }: { setup: boolean; onReady: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (values: Record<string, string>) => {
    setBusy(true);
    setError("");
    try {
      await api(setup ? "/setup/admin" : "/auth/login", "POST", values);
      onReady();
    } catch (error) {
      setError(error instanceof Error ? error.message : "连接失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <aside className="auth-intro">
        <Brand />
        <div className="auth-verse">
          <span>一纸心声</span>
          <span>皆有回响</span>
        </div>
        <p>让每个声音，被听见。</p>
      </aside>
      <section className="auth-card">
        <div className="eyebrow">回声 / ECHO</div>
        <Typography.Title level={2}>{setup ? "让每个声音，被听见。" : "欢迎回到回声"}</Typography.Title>
        <p className="muted">{setup ? "创建管理员，开始收集产品反馈。" : "把用户的想法，变成产品的下一步。"}</p>
        {error && <Alert showIcon title={error} type="error" />}
        <Form<Record<string, string>> layout="vertical" requiredMark={false} onFinish={values => void submit(values)}>
          {setup && (
            <Form.Item
              label="初始化密钥"
              name="setupToken"
              rules={[{ required: true, message: "请输入部署配置中的 SETUP_TOKEN" }]}
            >
              <Input.Password autoComplete="off" placeholder="从服务端 .env 中读取" />
            </Form.Item>
          )}
          <Form.Item label="管理员账号" name="username" rules={[{ required: true, message: "请输入账号" }]}>
            <Input autoComplete="username" maxLength={64} />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[
              { required: true, message: "请输入密码" },
              ...(setup ? [{ min: 12, message: "至少 12 位，包含字母和数字" }] : []),
            ]}
          >
            <Input.Password autoComplete={setup ? "new-password" : "current-password"} maxLength={128} />
          </Form.Item>
          <Button block htmlType="submit" loading={busy} size="large" type="primary">
            {setup ? "创建管理员" : "登录"}
          </Button>
        </Form>
        <p className="auth-footnote">轻量、自部署，让反馈留在你自己的服务里。</p>
      </section>
    </main>
  );
}
