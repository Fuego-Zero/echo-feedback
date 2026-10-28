import {
  type Config,
  type ImageStorage,
  type LogEntry,
  type RateLimiter,
  type Repository,
} from "@echo-feedback/runtime";
import { type FastifyInstance } from "fastify";

export interface ApiContext {
  app: FastifyInstance;
  config: Config;
  images: ImageStorage;
  limiter: RateLimiter;
  log: (entry: LogEntry) => void;
  repo: Repository;
}
