import { Pagination, Select } from "antd";

import { useI18n } from "./LanguageProvider.js";
import { useElementWidth } from "./useElementWidth.js";

interface Props {
  disabled: boolean;
  onChange: (page: number, pageSize: number) => void;
  page: number;
  pageSize: number;
  total: number;
}

export default function ListPagination({ page, pageSize, total, disabled, onChange }: Props) {
  const { t, locale } = useI18n();
  const { ref, width } = useElementWidth();
  return (
    <nav ref={ref} className="list-pagination" aria-label={t("pagination.label")}>
      <span className="muted">
        {t("pagination.summary", {
          total: new Intl.NumberFormat(locale).format(total),
          page,
          pages: Math.max(1, Math.ceil(total / pageSize)),
        })}
      </span>
      <div className="page-size">
        <span>{t("pagination.each")}</span>
        <Select
          disabled={disabled}
          options={[5, 10, 20, 50, 100].map(size => ({ value: size, label: t("pagination.items", { size }) }))}
          style={{ width: locale === "en" ? 128 : 96 }}
          value={pageSize}
          aria-label={t("pagination.size")}
          onChange={size => onChange(1, size)}
        />
      </div>
      <Pagination
        responsive
        showLessItems
        current={page}
        disabled={disabled}
        hideOnSinglePage={total === 0}
        pageSize={pageSize}
        showSizeChanger={false}
        simple={width < 640 ? { readOnly: true } : false}
        total={total}
        onChange={value => onChange(value, pageSize)}
      />
    </nav>
  );
}
