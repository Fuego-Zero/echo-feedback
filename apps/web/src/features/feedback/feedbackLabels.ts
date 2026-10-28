import type { FeedbackStatus } from "@echo-feedback/contracts";

export const feedbackLabels: Record<FeedbackStatus, string> = {
  pending: "待处理",
  processing: "处理中",
  resolved: "已解决",
};
