import { localeSchema } from "@echo-feedback/contracts/locale";
import { Button, Dropdown } from "antd";
import { useState } from "react";

import { useI18n } from "./LanguageProvider.js";

export default function LanguageSelect() {
  const { t, locale, setPreference } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Dropdown
      menu={{
        items: [
          { key: "zh-CN", label: "简体中文" },
          { key: "en", label: "English" },
        ],
        selectable: true,
        selectedKeys: [locale],
        onClick: ({ key }) => {
          const result = localeSchema.safeParse(key);
          if (result.success) {
            setPreference(result.data);
          }

          setOpen(false);
        },
      }}
      open={open}
      placement="bottomRight"
      trigger={["click"]}
      onOpenChange={setOpen}
    >
      <Button
        className="language-trigger"
        icon={
          <svg
            fill="none"
            height="16"
            stroke="currentColor"
            strokeWidth="1.6"
            viewBox="0 0 24 24"
            width="16"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <ellipse cx="12" cy="12" rx="4" ry="9" />
            <path d="M3 12h18M5 6.5c4 2 10 2 14 0M5 17.5c4-2 10-2 14 0" />
          </svg>
        }
        shape="circle"
        title={t("language.label")}
        type="text"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("language.label")}
      />
    </Dropdown>
  );
}
