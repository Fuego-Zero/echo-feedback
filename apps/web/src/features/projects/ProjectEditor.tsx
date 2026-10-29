import { type Project, projectInputSchema } from "@echo-feedback/contracts";
import { App, Form, Input, Modal, Switch } from "antd";
import { useState } from "react";

import { api } from "../../api/client.js";
import { useI18n } from "../../LanguageProvider.js";

function parseOrigins(value: unknown) {
  return (typeof value === "string" ? value : "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

export default function ProjectEditor({
  project,
  onClose,
  onSaved,
}: {
  project?: Project;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, errorText } = useI18n();
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
      allowedOrigins: parseOrigins(values.allowedOrigins),
    });
    if (!input.success) {
      void message.error(t("validation.input"));
      return;
    }

    setBusy(true);
    try {
      await api(project ? `/admin/projects/${project.id}` : "/admin/projects", project ? "PATCH" : "POST", input.data);
      void message.success(t("project.saved"));
      onSaved();
    } catch (error) {
      void message.error(errorText((error as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      cancelText={t("common.cancel")}
      confirmLoading={busy}
      okText={t("project.save")}
      title={project ? t("project.edit") : t("project.create")}
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
        <Form.Item label={t("project.name")} name="name" rules={[{ required: true }]}>
          <Input maxLength={80} placeholder={t("project.example")} />
        </Form.Item>
        <Form.Item label={t("project.description")} name="description">
          <Input.TextArea maxLength={500} rows={2} />
        </Form.Item>
        <Form.Item
          extra={t("project.originsHint")}
          label={t("project.origins")}
          name="allowedOrigins"
          rules={[
            {
              validator: (_rule, value: unknown) =>
                projectInputSchema.shape.allowedOrigins.safeParse(parseOrigins(value)).success
                  ? Promise.resolve()
                  : Promise.reject(new Error(t("validation.origin"))),
            },
          ]}
        >
          <Input.TextArea placeholder="https://app.example.com" rows={3} />
        </Form.Item>
        <Form.Item
          extra={t("project.extensionsHint")}
          label={t("project.extensions")}
          name="allowExtensionClients"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
        {!project && (
          <Form.Item label={t("project.enable")} name="enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
