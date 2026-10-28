import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { access, mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

import { limits } from "@echo-feedback/contracts";
import sharp from "sharp";

import { type Config } from "./config.js";
import { BusinessError } from "./errors.js";
import { type Repository } from "./repository.js";

export interface PreparedImage {
  digest: string;
  diskName: string;
  height: number;
  id: string;
  path: string;
  size: number;
  width: number;
}
export class ImageStorage {
  private processing = 0;
  constructor(private config: Config) {}
  async initialize() {
    await Promise.all(
      [this.config.uploadDir, this.config.attachmentDir].map(path => mkdir(path, { recursive: true, mode: 0o700 }))
    );
  }
  async health() {
    await Promise.all([this.config.uploadDir, this.config.attachmentDir].map(path => access(path, constants.W_OK)));
  }
  temporaryPath() {
    return join(this.config.uploadDir, `${randomUUID()}.upload`);
  }
  async prepare(path: string, mimetype: string): Promise<PreparedImage> {
    if (this.processing >= this.config.imageConcurrency) {
      throw new BusinessError("SERVICE_BUSY", 503);
    }

    this.processing += 1;
    const id = randomUUID();
    const outputPath = join(this.config.uploadDir, `${id}.webp`);
    try {
      const image = sharp(path, { limitInputPixels: limits.pixels, failOn: "warning" });
      const metadata = await image.metadata();
      const { format } = metadata;
      if (
        !format ||
        !["jpeg", "png", "webp"].includes(format) ||
        mimetype !== `image/${format}` ||
        (metadata.pages ?? 1) !== 1
      ) {
        throw new BusinessError("INVALID_IMAGE");
      }

      const hash = createHash("sha256");
      for await (const chunk of createReadStream(path)) {
        hash.update(chunk as Buffer);
      }

      const output = await image
        .autoOrient()
        .resize({ width: 4096, height: 4096, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toFile(outputPath);
      if (output.size > limits.imageBytes) {
        throw new BusinessError("IMAGE_TOO_LARGE", 413);
      }

      return {
        id,
        path: outputPath,
        diskName: `${id}.webp`,
        digest: hash.digest("hex"),
        size: output.size,
        width: output.width,
        height: output.height,
      };
    } catch (error) {
      await this.remove(outputPath);
      if (error instanceof BusinessError) {
        throw error;
      }

      throw new BusinessError("INVALID_IMAGE");
    } finally {
      this.processing -= 1;
    }
  }
  async promote(image: PreparedImage) {
    const path = this.path(image.diskName);
    await rename(image.path, path);
    image.path = path;
  }
  path(name: string) {
    if (!/^[a-f0-9-]{36}\.webp$/.test(name)) {
      throw new BusinessError("NOT_FOUND", 404);
    }

    return join(this.config.attachmentDir, name);
  }
  async remove(path: string) {
    await unlink(path).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    });
  }
  async cleanup(repo: Repository, now = Date.now()) {
    const referenced = new Set(repo.diskNames());
    for (const directory of [this.config.uploadDir, this.config.attachmentDir]) {
      // 清理必须逐项确认年龄与数据库引用，避免删除正在处理的文件。
      // eslint-disable-next-line no-await-in-loop
      const names = await readdir(directory);
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(
        names.map(async name => {
          const path = join(directory, name);
          const info = await stat(path);
          if (info.isFile() && info.mtimeMs < now - 86400000 && !referenced.has(name)) {
            await this.remove(path);
          }
        })
      );
    }
  }
}
