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

    throw new Error(result?.code || "REQUEST_FAILED");
  }

  return result as T;
}
