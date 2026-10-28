export interface Snapshot {
  files: File[];
  key: string;
  metadata: Record<string, string>;
}

export class SubmissionError extends Error {
  constructor(
    readonly code: string,
    readonly uncertain: boolean,
    readonly retryAfter?: string
  ) {
    super(code);
    this.name = "SubmissionError";
  }
}

export async function sendSnapshot(serverUrl: string, ak: string, snapshot: Snapshot, controller: AbortController) {
  const body = new FormData();
  body.append("metadata", JSON.stringify(snapshot.metadata));
  snapshot.files.forEach(file => body.append("images", file));
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(`${serverUrl}/api/public/projects/${ak}/feedback`, {
      method: "POST",
      body,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: { "Idempotency-Key": snapshot.key },
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => null)) as { code?: string; receipt?: string } | null;
    if (!response.ok) {
      throw new SubmissionError(
        data?.code ?? "SUBMIT_FAILED",
        response.status >= 500,
        response.headers.get("Retry-After") ?? undefined
      );
    }

    if (!data?.receipt) {
      throw new SubmissionError("INVALID_RESPONSE", true);
    }

    return data.receipt;
  } catch (error) {
    if (error instanceof SubmissionError) {
      throw error;
    }

    throw new SubmissionError("NETWORK_ERROR", true);
  } finally {
    clearTimeout(timer);
  }
}

export function errorMessage(error: SubmissionError) {
  const messages: Record<string, string> = {
    PROJECT_UNAVAILABLE: "该项目已暂停接收反馈。",
    ORIGIN_DENIED: "当前页面尚未获准接入，请联系项目管理员。",
    RATE_LIMITED: "提交有些频繁，请稍后重试。",
    INVALID_INPUT: "请检查正文和选填信息是否超出限制。",
    IMAGE_TOO_LARGE: "图片过大，请选择 5 MiB 以内的图片。",
    INVALID_IMAGE: "图片无法处理，请选择静态 JPG、PNG 或 WebP 图片。",
    PAYLOAD_TOO_LARGE: "附件总量过大，请减少图片后重试。",
    STORAGE_FULL: "服务的附件空间不足，请稍后重试。",
    IDEMPOTENCY_CONFLICT: "本次提交信息冲突，请关闭面板后重新初始化。",
  };
  return (
    messages[error.code] ||
    (error.uncertain ? "暂未确认是否提交成功。内容已保留，重试不会重复提交。" : "提交失败，请稍后重试。")
  );
}
