import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const derive = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, result) =>
      error ? reject(error) : resolve(result)
    );
  });
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const result = await derive(password, salt);
  return `${salt.toString("base64url")}.${result.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored?: string) {
  const [salt, expected] = (stored ?? "").split(".");
  const actual = await derive(password, salt ? Buffer.from(salt, "base64url") : Buffer.alloc(16));
  const reference = expected ? Buffer.from(expected, "base64url") : Buffer.alloc(64);
  return !!stored && reference.length === actual.length && timingSafeEqual(reference, actual);
}

export const randomToken = () => randomBytes(32).toString("base64url");
export const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");
export function equalSecret(left: string, right: string) {
  return !!right && timingSafeEqual(Buffer.from(hashToken(left)), Buffer.from(hashToken(right)));
}
