import { type Page, type Project } from "@echo-feedback/contracts";
import { Alert, App, Button, Empty, Modal, Popconfirm, Select, Space, Spin, Table, Tabs, Tag, Typography } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../../api/client.js";
import ListPagination from "../../ListPagination.js";
import { useElementWidth } from "../../useElementWidth.js";
import ProjectEditor from "./ProjectEditor.js";
import SdkPreview from "./SdkPreview.js";

export default function ProjectsPage() {
  const { message } = App.useApp();
  const [result, setResult] = useState<Page<Project>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const projects = result.items;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const requestId = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { ref, width } = useElementWidth();
  const [editor, setEditor] = useState<Project | "new" | null>(null);
  const [snippet, setSnippet] = useState<Project | null>(null);
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
    const { name, description, allowedOrigins, allowExtensionClients } = project;
    try {
      await api(`/admin/projects/${project.id}`, "PATCH", {
        name,
        description,
        allowedOrigins,
        allowExtensionClients,
        enabled: !project.enabled,
      });
      void message.success(project.enabled ? "已停用采集" : "已启用采集");
      await load();
    } catch (error) {
      void message.error((error as Error).message);
    }
  };

  const actions = (item: Project) => (
    <Space>
      <Button type="link" onClick={() => setEditor(item)}>
        编辑
      </Button>
      <Button type="link" onClick={() => setSnippet(item)}>
        接入
      </Button>
      <Popconfirm
        cancelText="取消"
        description="停用后拒绝新提交，已有反馈仍保留。"
        okText="确认"
        title={item.enabled ? "停用采集？" : "启用采集？"}
        onConfirm={() => {
          void toggle(item);
        }}
      >
        <Button type="link">{item.enabled ? "停用" : "启用"}</Button>
      </Popconfirm>
    </Space>
  );
  const options = snippet
    ? JSON.stringify({ serverUrl: location.origin, ak: snippet.ak, showTrigger: true, uiStyle }, null, 2)
    : "";
  const npm = `import { init } from '@echo-feedback/sdk';\n\nconst feedback = init(${options});\n// 自定义入口：设置 showTrigger: false，然后调用 feedback.open()。\n// 页面卸载：feedback.destroy();`;
  const script = `<script src="${location.origin}/sdk/0.1.0/echo-feedback.iife.js" referrerpolicy="no-referrer"></script>\n<script>\nconst feedback = EchoFeedback.init(${options});\n</script>`;
  const snippetView = (code: string) => (
    <>
      <pre className="code-block">{code}</pre>
      <Button
        onClick={() => {
          void navigator.clipboard.writeText(code).then(
            () => message.success("已复制"),
            () => message.error("复制失败，请手动选择代码")
          );
        }}
      >
        复制示例
      </Button>
    </>
  );
  return (
    <div ref={ref}>
      <div className="page-heading">
        <div>
          <h1>连接你的产品</h1>
          <p className="muted">每个项目一个接入标识，所有反馈集中处理。</p>
        </div>
        <Button size="large" type="primary" onClick={() => setEditor("new")}>
          创建项目
        </Button>
      </div>

      {error && (
        <Alert
          showIcon
          action={<Button onClick={() => void load()}>重试</Button>}
          description={error}
          title="项目加载失败"
          type="error"
        />
      )}
      {!error && loading && (
        <div className="page-state is-loading">
          <Spin />
          <p className="muted">正在读取项目…</p>
        </div>
      )}
      {!error && !loading && width < 608 && (
        <section aria-label="项目列表">
          {projects.length ? (
            projects.map(item => (
              <article key={item.id} className="project-card">
                <h2>{item.name}</h2>
                <p className="muted">{item.description || "暂无项目说明"}</p>
                <p>
                  <Typography.Text code copyable={{ text: item.ak }}>
                    {item.ak.slice(0, 12)}…
                  </Typography.Text>
                </p>
                <Tag color={item.enabled ? "success" : "default"}>{item.enabled ? "已启用" : "已停用"}</Tag>
                <div className="project-actions">{actions(item)}</div>
              </article>
            ))
          ) : (
            <Empty description="创建第一个项目，让用户的声音抵达这里" />
          )}
        </section>
      )}
      {!error && !loading && width >= 608 && (
        <Table
          columns={[
            {
              title: "项目",
              key: "name",
              render: (_, item) => (
                <>
                  <Typography.Text strong>{item.name}</Typography.Text>
                  <div className="muted">{item.description}</div>
                </>
              ),
            },
            {
              title: "接入标识 AK",
              dataIndex: "ak",
              render: (value: string) => (
                <Typography.Text code copyable={{ text: value }}>{`${String(value).slice(0, 12)}…`}</Typography.Text>
              ),
            },
            {
              title: "采集",
              dataIndex: "enabled",
              render: value => <Tag color={value ? "success" : "default"}>{value ? "已启用" : "已停用"}</Tag>,
            },
            {
              title: "操作",
              key: "actions",
              width: 220,
              render: (_, item) => actions(item),
            },
          ]}
          dataSource={projects}
          loading={loading}
          locale={{ emptyText: <Empty description="创建第一个项目，让用户的声音抵达这里" /> }}
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
        footer={null}
        open={!!snippet}
        title={`${snippet?.name ?? ""} · SDK 接入`}
        width={1180}
        onCancel={() => setSnippet(null)}
      >
        <p>AK 是公开项目标识，不需要用户登录。芸笺等扩展请使用 npm 打包接入。</p>
        <Space wrap>
          <span>表单风格</span>
          <Select
            options={[
              { value: "paper", label: "宣纸朱砂" },
              { value: "classic", label: "经典简洁" },
              { value: "celadon", label: "青瓷竹简" },
              { value: "gilded", label: "墨夜鎏金" },
              { value: "cyber", label: "霓虹边界" },
              { value: "freedom", label: "自由之翼" },
              { value: "justice", label: "正义之翼" },
            ]}
            value={uiStyle}
            aria-label="表单风格"
            onChange={setUiStyle}
          />
        </Space>
        <p className="muted">选择会更新下方接入代码，由宿主项目配置；不会修改项目数据。</p>
        <div className="sdk-integration-layout">
          <div className="sdk-integration-code">
            <Tabs
              items={[
                { key: "npm", label: "npm", children: snippetView(npm) },
                { key: "script", label: "普通 script", children: snippetView(script) },
              ]}
            />
          </div>
          {snippet && <SdkPreview uiStyle={uiStyle} />}
        </div>
      </Modal>
    </div>
  );
}
