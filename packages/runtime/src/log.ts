import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

export interface LogEntry {
  code?: string;
  durationMs?: number;
  operation: string;
  requestId?: string;
  resourceId?: string;
  status?: number;
}
export function createLogger(directory: string) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  let previousDay = "";
  return (entry: LogEntry) => {
    const day = new Date().toISOString().slice(0, 10);
    // 只投影允许的字段，不序列化异常、请求、响应或调用方额外字段。
    const safe = {
      time: new Date().toISOString(),
      operation: entry.operation,
      requestId: entry.requestId,
      resourceId: entry.resourceId,
      status: entry.status,
      code: entry.code,
      durationMs: entry.durationMs,
    };
    try {
      if (day !== previousDay) {
        for (const name of readdirSync(directory)) {
          if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name) && Date.parse(name.slice(0, 10)) < Date.now() - 14 * 86400000) {
            unlinkSync(join(directory, name));
          }
        }

        previousDay = day;
      }

      appendFileSync(join(directory, `${day}.jsonl`), `${JSON.stringify(safe)}\n`, { mode: 0o600 });
    } catch {
      console.error("日志写入失败");
    }
  };
}
