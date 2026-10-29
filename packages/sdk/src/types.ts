// SDK 的公开声明独立发布，不引用工作区私有包。
export type Locale = "zh-CN" | "en";
export type LocalePreference = Locale | "auto";

export interface FeedbackContext {
  projectVersion?: string;
  userId?: string;
}
export interface FeedbackOpenOptions extends FeedbackContext {
  locale?: LocalePreference;
}
export interface FeedbackOptions extends FeedbackContext {
  ak: string;
  locale?: LocalePreference;
  mountTarget?: HTMLElement;
  nonce?: string;
  onClose?: () => void;
  onError?: (error: Error) => void;
  onOpen?: () => void;
  primaryColor?: string;
  serverUrl: string;
  showTrigger?: boolean;
  theme?: "light" | "dark" | "system";
  uiStyle?: "paper" | "classic" | "celadon" | "gilded" | "cyber" | "freedom" | "justice" | "orbital";
}
export interface FeedbackInstance {
  destroy(): void;
  open(context?: FeedbackOpenOptions): void;
  setLocale(locale: LocalePreference): void;
}
