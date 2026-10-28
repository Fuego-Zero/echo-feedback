import { Pagination, Select } from "antd";

import { useElementWidth } from "./useElementWidth.js";

interface Props {
  disabled: boolean;
  onChange: (page: number, pageSize: number) => void;
  page: number;
  pageSize: number;
  total: number;
}

export default function ListPagination({ page, pageSize, total, disabled, onChange }: Props) {
  const { ref, width } = useElementWidth();
  return (
    <nav ref={ref} className="list-pagination" aria-label="列表分页">
      <span className="muted">
        共 {total} 条 · 第 {page} / {Math.max(1, Math.ceil(total / pageSize))} 页
      </span>
      <div className="page-size">
        <span>每页</span>
        <Select
          disabled={disabled}
          options={[5, 10, 20, 50, 100].map(size => ({ value: size, label: `${size} 条` }))}
          style={{ width: 96 }}
          value={pageSize}
          aria-label="每页条数"
          onChange={size => onChange(1, size)}
        />
      </div>
      <Pagination
        responsive
        showLessItems
        current={page}
        disabled={disabled}
        pageSize={pageSize}
        showSizeChanger={false}
        simple={width < 640 ? { readOnly: true } : false}
        total={total}
        onChange={value => onChange(value, pageSize)}
      />
    </nav>
  );
}
