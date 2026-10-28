import { type Project, projectInputSchema } from "@echo-feedback/contracts";
import { App, Form, Input, Modal, Switch } from "antd";
import { useState } from "react";

import { api } from "../../api/client.js";

export default function ProjectEditor({
  project,
  onClose,
  onSaved,
}: {
  project?: Project;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form] = Form.useForm<{
    name: string;
    description?: string;
    allowedOrigins?: string;
    enabled?: boolean;
    allowExtensionClients?: boolean;
  }>();
  const [busy, setBusy] = useState(false);
  const { message } = App.useApp();
  const save = async () => {
    const values = await form.validateFields().catch(() => undefined);
    if (!values) {
      return;
    }

    const input = projectInputSchema.safeParse({
      ...values,
      enabled: project?.enabled ?? values.enabled,
      allowedOrigins: String(values.allowedOrigins ?? "")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean),
    });
    if (!input.success) {
      void message.error(input.error.issues[0]?.message || "请检查输入");
      return;
    }

    setBusy(true);
    try {
      await api(project ? `/admin/projects/${project.id}` : "/admin/projects", project ? "PATCH" : "POST", input.data);
      void message.success("项目已保存");
      onSaved();
    } catch (error) {
      void message.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      cancelText="取消"
      confirmLoading={busy}
      okText="保存项目"
      title={project ? "编辑项目" : "创建项目"}
      onCancel={onClose}
      onOk={() => void save()}
    >
      <Form
        form={form}
        initialValues={
          project
            ? { ...project, allowedOrigins: project.allowedOrigins.join("\n") }
            : { enabled: true, allowExtensionClients: false }
        }
        layout="vertical"
      >
        <Form.Item label="项目名称" name="name" rules={[{ required: true }]}>
          <Input maxLength={80} placeholder="例如：岁时记" />
        </Form.Item>
        <Form.Item label="项目说明" name="description">
          <Input.TextArea maxLength={500} rows={2} />
        </Form.Item>
        <Form.Item
          extra="每行一个完整 Origin，例如 https://app.example.com；留空允许任意 HTTP(S) 网页。"
          label="允许的网页来源"
          name="allowedOrigins"
        >
          <Input.TextArea placeholder="https://app.example.com" rows={3} />
        </Form.Item>
        <Form.Item
          extra="兼容扩展来源、无 Origin 和 null Origin；此选项不是身份认证。"
          label="允许浏览器扩展接入"
          name="allowExtensionClients"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
        {!project && (
          <Form.Item label="启用采集" name="enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
