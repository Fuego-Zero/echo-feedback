import { type Feedback, feedbackUpdateSchema, statuses } from "@echo-feedback/contracts";
import { Alert, App, Button, Descriptions, Form, Image, Input, Select, Space, Typography } from "antd";
import { useState } from "react";

import { api } from "../../api/client.js";
import { feedbackLabels as statusLabels } from "./feedbackLabels.js";

export default function FeedbackDetail({ feedback, onSaved }: { feedback: Feedback; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { message } = App.useApp();
  const save = async (values: unknown) => {
    const input = feedbackUpdateSchema.safeParse(values);
    if (!input.success) {
      void message.error("请检查处理状态和备注长度");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await api(`/admin/feedback/${feedback.id}`, "PATCH", input.data);
      void message.success("处理记录已保存");
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
              alt="用户主动上传的反馈图片"
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
          { key: "time", label: "提交时间", children: new Date(feedback.createdAt).toLocaleString() },
          { key: "contact", label: "联系方式", children: feedback.contact || "未填写" },
          {
            key: "user",
            label: "用户标识",
            children: feedback.userId ? `${feedback.userId}（业务方传入，未验证）` : "未提供",
          },
          { key: "version", label: "项目版本", children: feedback.projectVersion || "未提供" },
          {
            key: "page",
            label: "来源页面",
            children: (
              <Typography.Text style={{ overflowWrap: "anywhere" }}>{feedback.sourcePage || "未采集"}</Typography.Text>
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
        {error && <Alert showIcon description={error} title="保存失败" type="error" />}
        <Form.Item label="处理状态" name="status">
          <Select options={statuses.map(value => ({ value, label: statusLabels[value] }))} />
        </Form.Item>
        <Form.Item extra="仅管理员可见，不会发送给反馈用户。" label="内部处理备注" name="note">
          <Input.TextArea showCount maxLength={5000} rows={5} />
        </Form.Item>
        <Button htmlType="submit" loading={busy} type="primary">
          保存处理记录
        </Button>
      </Form>
    </>
  );
}
