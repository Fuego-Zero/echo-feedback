import { type Page, type Project } from "@echo-feedback/contracts";
import type { LocalePreference } from "@echo-feedback/contracts/locale";
import { Alert, App, Button, Empty, Modal, Select, Space, Spin, Switch, Table, Tabs, Typography } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../../api/client.js";
import { useI18n } from "../../LanguageProvider.js";
import ListPagination from "../../ListPagination.js";
import { useElementWidth } from "../../useElementWidth.js";
import ProjectEditor from "./ProjectEditor.js";
import SdkPreview from "./SdkPreview.js";

export default function ProjectsPage() {
  const { t, errorText } = useI18n();
  const { message } = App.useApp();
  const [result, setResult] = useState<Page<Project>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const projects = result.items;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const requestId = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string[]>([]);
  const { ref, width } = useElementWidth();
  const [editor, setEditor] = useState<Project | "new" | null>(null);
  const [snippet, setSnippet] = useState<Project | null>(null);
  const [formLocale, setFormLocale] = useState<LocalePreference>("auto");
  const [uiStyle, setUiStyle] = useState<"paper" | "classic" | "celadon" | "gilded" | "cyber" | "freedom" | "justice">(
    "paper"
  );
  const load = useCallback(async () => {
    requestId.current += 1;
    const { current } = requestId;
    setLoading(true);
    setError("");
    try {
      const next = await api<Page<Project>>(`/admin/projects?page=${page}&pageSize=${pageSize}`);
      if (current !== requestId.current) {
        return;
      }

      const lastPage = Math.max(1, Math.ceil(next.total / pageSize));
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }

      setResult(next);
    } catch (error) {
      if (current === requestId.current) {
        setError((error as Error).message);
      }
    } finally {
      if (current === requestId.current) {
        setLoading(false);
      }
    }
  }, [page, pageSize]);
  // 从外部 API 异步加载项目。

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);
  const toggle = async (project: Project) => {
    setBusy(value => [...value, project.id]);
    const { name, description, allowedOrigins, allowExtensionClients } = project;
    try {
      await api(`/admin/projects/${project.id}`, "PATCH", {
        name,
        description,
        allowedOrigins,
        allowExtensionClients,
        enabled: !project.enabled,
      });
      void message.success(project.enabled ? t("project.disabledToast") : t("project.enabledToast"));
      await load();
    } catch (error) {
      void message.error(errorText((error as Error).message));
    } finally {
      setBusy(value => value.filter(id => id !== project.id));
    }
  };

  const remove = async (project: Project) => {
    setBusy(value => [...value, project.id]);
    try {
      await api(`/admin/projects/${project.id}`, "DELETE");
      void message.success(t("project.deleted"));
      await load();
    } catch (error) {
      void message.error(errorText((error as Error).message));
    } finally {
      setBusy(value => value.filter(id => id !== project.id));
    }
  };

  const collectionSwitch = (item: Project) => (
    <Switch
      checked={item.enabled}
      checkedChildren={t("project.enabled")}
      loading={busy.includes(item.id)}
      unCheckedChildren={t("project.disabled")}
      aria-label={t("project.collectionLabel", { name: item.name })}
      onChange={() => void toggle(item)}
    />
  );

  const actions = (item: Project) => (
    <Space>
      <Button type="link" onClick={() => setEditor(item)}>
        {t("common.edit")}
      </Button>
      <Button type="link" onClick={() => setSnippet(item)}>
        {t("project.integrate")}
      </Button>
      <Button danger disabled={busy.includes(item.id)} type="link" onClick={() => void remove(item)}>
        {t("common.delete")}
      </Button>
    </Space>
  );
  const options = snippet
    ? JSON.stringify(
        { serverUrl: location.origin, ak: snippet.ak, showTrigger: true, uiStyle, locale: formLocale },
        null,
        2
      )
    : "";
  const npm = `import { init } from '@echo-feedback/sdk';\n\nconst feedback = init(${options});\n// 自定义入口：设置 showTrigger: false，然后调用 feedback.open()。\n// 页面卸载：feedback.destroy();`;
  const script = `<script src="${location.origin}/sdk/0.2.0/echo-feedback.iife.js" referrerpolicy="no-referrer"></script>\n<script>\nconst feedback = EchoFeedback.init(${options});\n</script>`;
  const snippetView = (code: string) => (
    <>
      <pre className="code-block">{code}</pre>
      <Button
        onClick={() => {
          void navigator.clipboard.writeText(code).then(
            () => message.success(t("common.copied")),
            () => message.error(t("common.copyFailed"))
          );
        }}
      >
        {t("integration.copy")}
      </Button>
    </>
  );
  return (
    <div ref={ref}>
      <div className="page-heading">
        <div>
          <h1>{t("project.heading")}</h1>
          <p className="muted">{t("project.intro")}</p>
        </div>
        <Button size="large" type="primary" onClick={() => setEditor("new")}>
          {t("project.create")}
        </Button>
      </div>

      {error && (
        <Alert
          showIcon
          action={<Button onClick={() => void load()}>{t("common.retry")}</Button>}
          description={errorText(error)}
          title={t("project.failed")}
          type="error"
        />
      )}
      {!error && loading && (
        <div className="page-state is-loading">
          <Spin />
          <p className="muted">{t("project.loading")}</p>
        </div>
      )}
      {!error && !loading && width < 608 && (
        <section aria-label={t("project.list")}>
          {projects.length ? (
            projects.map(item => (
              <article key={item.id} className="project-card">
                <h2>{item.name}</h2>
                <p className="muted">{item.description || t("project.noDescription")}</p>
                <p>
                  <Typography.Text code copyable={{ text: item.ak }}>
                    {item.ak.slice(0, 12)}…
                  </Typography.Text>
                </p>
                {collectionSwitch(item)}
                <div className="project-actions">{actions(item)}</div>
              </article>
            ))
          ) : (
            <Empty description={t("project.empty")} />
          )}
        </section>
      )}
      {!error && !loading && width >= 608 && (
        <Table
          columns={[
            {
              title: t("project.label"),
              key: "name",
              render: (_, item) => (
                <>
                  <Typography.Text strong>{item.name}</Typography.Text>
                  <div className="muted">{item.description}</div>
                </>
              ),
            },
            {
              title: t("project.ak"),
              dataIndex: "ak",
              width: 170,
              render: (value: string) => (
                <Typography.Text
                  code
                  className="project-key"
                  copyable={{ text: value }}
                >{`${String(value).slice(0, 12)}…`}</Typography.Text>
              ),
            },
            {
              title: t("project.collection"),
              dataIndex: "enabled",
              width: 110,
              render: (_, item) => collectionSwitch(item),
            },
            {
              title: t("common.actions"),
              key: "actions",
              width: 220,
              render: (_, item) => actions(item),
            },
          ]}
          dataSource={projects}
          loading={loading}
          locale={{ emptyText: <Empty description={t("project.empty")} /> }}
          pagination={false}
          rowKey="id"
          scroll={{ x: 720 }}
        />
      )}
      {!error && (
        <ListPagination
          disabled={loading}
          page={page}
          pageSize={pageSize}
          total={result.total}
          onChange={(value, size) => {
            setPage(value);
            setPageSize(size);
          }}
        />
      )}
      {editor && (
        <ProjectEditor
          project={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            if (editor === "new" && page !== 1) {
              setPage(1);
            } else {
              void load();
            }
          }}
        />
      )}
      <Modal
        destroyOnHidden
        className="sdk-integration-modal"
        footer={null}
        open={!!snippet}
        title={t("integration.title", { name: snippet?.name ?? "" })}
        width={1180}
        onCancel={() => setSnippet(null)}
      >
        <p className="sdk-integration-intro">{t("integration.intro")}</p>
        <div className="sdk-integration-layout">
          <div className="sdk-integration-options">
            <Space wrap>
              <span>{t("integration.style")}</span>
              <Select
                options={[
                  { value: "paper", label: t("style.paper") },
                  { value: "classic", label: t("style.classic") },
                  { value: "celadon", label: t("style.celadon") },
                  { value: "gilded", label: t("style.gilded") },
                  { value: "cyber", label: t("style.cyber") },
                  { value: "freedom", label: t("style.freedom") },
                  { value: "justice", label: t("style.justice") },
                ]}
                value={uiStyle}
                virtual={false}
                aria-label={t("integration.style")}
                onChange={setUiStyle}
              />
            </Space>
            <Space wrap>
              <span>{t("language.form")}</span>
              <Select
                options={[
                  { value: "auto", label: t("language.host") },
                  { value: "zh-CN", label: "简体中文" },
                  { value: "en", label: "English" },
                ]}
                value={formLocale}
                virtual={false}
                aria-label={t("language.form")}
                onChange={setFormLocale}
              />
            </Space>
            <p className="muted">{t("integration.hint")}</p>
          </div>
          <div className="sdk-integration-code">
            <Tabs
              items={[
                { key: "npm", label: "npm", children: snippetView(npm) },
                { key: "script", label: t("integration.script"), children: snippetView(script) },
              ]}
            />
          </div>
          {snippet && <SdkPreview key={`${uiStyle}:${formLocale}`} formLocale={formLocale} uiStyle={uiStyle} />}
        </div>
      </Modal>
    </div>
  );
}
