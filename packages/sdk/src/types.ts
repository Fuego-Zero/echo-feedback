export interface FeedbackContext {
  projectVersion?: string;
  userId?: string;
}
export interface FeedbackOptions extends FeedbackContext {
  ak: string;
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
  open(context?: FeedbackContext): void;
}
