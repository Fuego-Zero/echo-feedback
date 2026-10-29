import { type Feedback, feedbackUpdateSchema, statuses } from "@echo-feedback/contracts";
import { Alert, App, Button, Descriptions, Form, Image, Input, Radio, Space, Typography } from "antd";
import { useState } from "react";

import { api } from "../../api/client.js";
import { useI18n } from "../../LanguageProvider.js";
import { useFeedbackLabels } from "./feedbackLabels.js";

export default function FeedbackDetail({ feedback, onSaved }: { feedback: Feedback; onSaved: () => void }) {
  const { t, locale, errorText } = useI18n();
  const statusLabels = useFeedbackLabels();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { message } = App.useApp();
  const save = async (values: unknown) => {
    const input = feedbackUpdateSchema.safeParse(values);
    if (!input.success) {
      void message.error(t("feedback.validation"));
      return;
    }

    setBusy(true);
    setError("");
    try {
      await api(`/admin/feedback/${feedback.id}`, "PATCH", input.data);
      void message.success(t("feedback.saved"));
      onSaved();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="eyebrow">{feedback.projectName}</div>
      <p className="feedback-body">{feedback.content}</p>
      <Image.PreviewGroup>
        <Space wrap>
          {feedback.attachments.map(image => (
            <Image
              key={image.id}
              alt={t("feedback.image")}
              height={100}
              src={`/api/admin/feedback/${feedback.id}/attachments/${image.id}`}
              styles={{ image: { objectFit: "cover" } }}
              width={130}
            />
          ))}
        </Space>
      </Image.PreviewGroup>
      <Descriptions
        className="detail-meta"
        column={1}
        items={[
          { key: "time", label: t("feedback.time"), children: new Date(feedback.createdAt).toLocaleString(locale) },
          { key: "contact", label: t("feedback.contact"), children: feedback.contact || t("feedback.blank") },
          {
            key: "user",
            label: t("feedback.user"),
            children: feedback.userId ? t("feedback.unverified", { user: feedback.userId }) : t("feedback.missing"),
          },
          { key: "version", label: t("feedback.version"), children: feedback.projectVersion || t("feedback.missing") },
          {
            key: "page",
            label: t("feedback.source"),
            children: (
              <Typography.Text style={{ overflowWrap: "anywhere" }}>
                {feedback.sourcePage || t("feedback.notCollected")}
              </Typography.Text>
            ),
          },
        ]}
        size="small"
      />
      <Form
        initialValues={{ status: feedback.status, note: feedback.note }}
        layout="vertical"
        onFinish={values => void save(values)}
      >
        {error && <Alert showIcon description={errorText(error)} title={t("feedback.saveFailed")} type="error" />}
        <Form.Item label={t("feedback.status")} name="status">
          <Radio.Group buttonStyle="solid" className="feedback-status" aria-label={t("feedback.status")}>
            {statuses.map(value => (
              <Radio.Button key={value} value={value}>
                {statusLabels[value]}
              </Radio.Button>
            ))}
          </Radio.Group>
        </Form.Item>
        <Form.Item extra={t("feedback.noteHint")} label={t("feedback.note")} name="note">
          <Input.TextArea showCount className="feedback-note" maxLength={5000} rows={5} />
        </Form.Item>
        <Button htmlType="submit" loading={busy} type="primary">
          {t("feedback.save")}
        </Button>
      </Form>
    </>
  );
}
