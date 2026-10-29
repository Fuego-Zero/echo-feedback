import type { FeedbackStatus } from "@echo-feedback/contracts";

import { useI18n } from "../../LanguageProvider.js";

export function useFeedbackLabels(): Record<FeedbackStatus, string> {
  const { t } = useI18n();
  return { pending: t("status.pending"), processing: t("status.processing"), resolved: t("status.resolved") };
}
