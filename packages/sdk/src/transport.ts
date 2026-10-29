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
