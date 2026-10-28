import { BusinessError } from "./errors.js";

export class RateLimiter {
  private entries = new Map<string, { count: number; end: number }>();
  consume(key: string, limit: number, now = Date.now()) {
    if (this.entries.size >= 10000) {
      for (const [id, entry] of this.entries) {
        if (entry.end <= now) {
          this.entries.delete(id);
        }
      }

      if (this.entries.size >= 10000 && !this.entries.has(key)) {
        throw new BusinessError("SERVICE_BUSY", 503);
      }
    }

    let entry = this.entries.get(key);
    if (!entry || entry.end <= now) {
      entry = { count: 0, end: now + 60000 };
      this.entries.set(key, entry);
    }

    entry.count += 1;
    if (entry.count > limit) {
      throw new BusinessError("RATE_LIMITED", 429);
    }
  }
}
