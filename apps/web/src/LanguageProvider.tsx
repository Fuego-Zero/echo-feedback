import {
  type Locale,
  type LocalePreference,
  localePreferenceSchema,
  resolveLocale,
} from "@echo-feedback/contracts/locale";
import { ConfigProvider } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import { createContext, type ReactNode, use, useCallback, useEffect, useState } from "react";

import { en, type MessageKey, zh } from "./messages.js";
import { theme } from "./theme.js";

const storageKey = "echo-feedback:language";
interface LanguageContext {
  errorText: (code: string) => string;
  locale: Locale;
  preference: LocalePreference;
  setPreference: (preference: LocalePreference) => void;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
}
const Context = createContext<LanguageContext | undefined>(undefined);

function readPreference(): LocalePreference {
  try {
    const result = localePreferenceSchema.safeParse(localStorage.getItem(storageKey));
    return result.success ? result.data : "auto";
  } catch {
    return "auto";
  }
}

export default function LanguageProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<LocalePreference>(readPreference);
  const [languages, setLanguages] = useState(() => [...navigator.languages, navigator.language]);
  const locale = resolveLocale(preference, "", languages);
  const t = useCallback<LanguageContext["t"]>(
    (key, params = {}) =>
      (locale === "en" ? en[key] : zh[key]).replace(/\{(\w+)\}/g, (token, name: string) =>
        Object.hasOwn(params, name) ? String(params[name]) : token
      ),
    [locale]
  );
  const errorText = (code: string) => {
    const key = `error.${code}`;
    return t(Object.hasOwn(zh, key) ? (key as MessageKey) : "error.default");
  };

  useEffect(() => {
    const changed = () => setLanguages([...navigator.languages, navigator.language]);
    window.addEventListener("languagechange", changed);
    return () => window.removeEventListener("languagechange", changed);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = locale === "en" ? en["page.title"] : zh["page.title"];
  }, [locale]);
  const changePreference = (value: LocalePreference) => {
    const result = localePreferenceSchema.safeParse(value);
    const next = result.success ? result.data : "auto";
    setPreference(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      /* 禁用存储时仍允许当前页面切换语言。 */
    }
  };

  return (
    <Context value={{ locale, preference, setPreference: changePreference, t, errorText }}>
      <ConfigProvider locale={locale === "en" ? enUS : zhCN} theme={theme}>
        {children}
      </ConfigProvider>
    </Context>
  );
}

export function useI18n() {
  const value = use(Context);
  if (!value) {
    throw new Error("LanguageProvider is required");
  }

  return value;
}
