const messages: Record<string, string> = {
  AUTH_REQUIRED: "登录已过期，请重新登录",
  INVALID_CREDENTIALS: "账号、密码或初始化密钥不正确",
  INVALID_INPUT: "请检查输入内容",
  SETUP_CLOSED: "初始化已完成，请登录",
  ORIGIN_DENIED: "当前来源未获允许",
  RATE_LIMITED: "操作太频繁，请稍后再试",
  SERVICE_BUSY: "服务繁忙，请稍后再试",
};
export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const result = (await response.json()) as { code: string };
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/login") && !path.startsWith("/setup")) {
      window.dispatchEvent(new Event("echo:auth-expired"));
    }

    throw new Error(messages[result.code] ?? "操作未完成，请稍后重试");
  }

  return result as T;
}
