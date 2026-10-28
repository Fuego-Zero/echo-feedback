import type { ThemeConfig } from "antd";

export const theme: ThemeConfig = {
  token: {
    motion: false,
    colorPrimary: "#A64232",
    colorInfo: "#536B78",
    colorSuccess: "#4E694A",
    colorWarning: "#866022",
    colorError: "#A12626",
    colorText: "#302B26",
    colorTextSecondary: "#766552",
    colorTextDescription: "#766552",
    colorTextTertiary: "#766552",
    colorTextQuaternary: "#766552",
    colorTextPlaceholder: "#766552",
    colorBorder: "#988671",
    colorBgLayout: "#F4EBDD",
    colorBgContainer: "#FBF7EF",
    colorBgElevated: "#FBF7EF",
    borderRadius: 6,
    controlHeight: 32,
    fontFamily: 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  components: {
    Button: { primaryShadow: "none" },
    Pagination: { itemSize: 32, itemSizeSM: 32 },
    Table: {
      cellPaddingBlock: 10,
      cellPaddingInline: 12,
      headerBg: "#F0E6D6",
      headerColor: "#766552",
      rowHoverBg: "#F4EBDD",
      borderColor: "#D8C8AF",
    },
    Tabs: { inkBarColor: "#A64232" },
  },
};
