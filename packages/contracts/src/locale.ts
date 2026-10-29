import { z } from "zod/mini";

export const localeSchema = z.enum(["zh-CN", "en"]);
export const localePreferenceSchema = z.union([localeSchema, z.literal("auto")]);
export type Locale = z.infer<typeof localeSchema>;
export type LocalePreference = z.infer<typeof localePreferenceSchema>;

export function normalizeLocale(value: unknown): Locale | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const language = value.trim().toLowerCase().split("-")[0];
  const result = localeSchema.safeParse(language === "zh" ? "zh-CN" : language);
  return result.success ? result.data : undefined;
}

export function resolveLocale(preference: unknown, pageLanguage: string, languages: readonly string[]): Locale {
  return (
    normalizeLocale(preference) ??
    normalizeLocale(pageLanguage) ??
    languages.map(normalizeLocale).find(value => value !== undefined) ??
    "zh-CN"
  );
}
