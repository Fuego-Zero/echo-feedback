import { App as AntApp, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { createRoot } from "react-dom/client";

import App from "./App.js";
import { theme } from "./theme.js";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <ConfigProvider locale={zhCN} theme={theme}>
    <AntApp>
      <App />
    </AntApp>
  </ConfigProvider>
);
