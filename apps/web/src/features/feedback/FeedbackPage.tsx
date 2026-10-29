import { type Feedback, type Page, type Project, statuses } from "@echo-feedback/contracts";
import { Alert, Button, Drawer, Empty, Select, Spin, Tag } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../../api/client.js";
import ListPagination from "../../ListPagination.js";
import FeedbackDetail from "./FeedbackDetail.js";
import { feedbackLabels as statusLabels } from "./feedbackLabels.js";

export default function FeedbackPage() {
  const [projects, setProjects] = useState<Pick<Project, "id" | "name">[]>([]);
  const [projectError, setProjectError] = useState("");
  const [projectId, setProjectId] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [result, setResult] = useState<Page<Feedback>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [selected, setSelected] = useState<Feedback>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const lastTrigger = useRef<HTMLElement | null>(null);
  const load = useCallback(async () => {
    requestId.current += 1;
    const { current } = requestId;
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (projectId) {
      query.set("projectId", projectId);
    }

    if (status) {
      query.set("status", status);
    }

    try {
      const next = await api<Page<Feedback>>(`/admin/feedback?${query.toString()}`);
      if (current !== requestId.current) {
        return;
      }

      const lastPage = Math.max(1, Math.ceil(next.total / pageSize));
      if (page > lastPage) {
        setPage(lastPage);
        setSelected(undefined);
        return;
      }

      setResult(next);
      setSelected(previous => (previous ? next.items.find(item => item.id === previous.id) : undefined));
    } catch (failure) {
      if (current === requestId.current) {
        setError((failure as Error).message);
      }
    } finally {
      if (current === requestId.current) {
        setLoading(false);
      }
    }
  }, [page, pageSize, projectId, status]);
  useEffect(() => {
    // 筛选变更后读取外部数据，序号阻止过期响应覆盖新列表。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);
  const loadProjects = useCallback(async () => {
    try {
      const value = await api<{ items: Pick<Project, "id" | "name">[] }>("/admin/projects/options");
      setProjects(value.items);
      setProjectError("");
    } catch (failure) {
      setProjectError((failure as Error).message);
    }
  }, []);
  useEffect(() => {
    // 项目选项来自外部 API。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProjects();
  }, [loadProjects]);
  const close = () => {
    setSelected(undefined);
    lastTrigger.current?.focus({ preventScroll: true });
  };

  const detail = selected && (
    <FeedbackDetail
      key={`${selected.id}:${selected.status}:${selected.note}`}
      feedback={selected}
      onSaved={() => {
        close();

        void load();
      }}
    />
  );
  return (
    <div>
      <div className="page-heading">
        <div>
          <div className="eyebrow">回声 / INBOX</div>
          <h1>每一个声音，都值得回应。</h1>
          <p className="muted">收集想法，发现问题，记录每一次改进。</p>
        </div>
        <Button loading={loading} onClick={() => void load()}>
          刷新反馈
        </Button>
      </div>
      {projectError && (
        <Alert
          showIcon
          action={<Button onClick={() => void loadProjects()}>重试</Button>}
          description={projectError}
          title="项目筛选加载失败"
          type="error"
        />
      )}
      <div className="filter-bar">
        <div className="status-filters" role="group" aria-label="筛选状态">
          {[undefined, ...statuses].map(value => (
            <Button
              key={value ?? "all"}
              type={status === value ? "primary" : "default"}
              aria-pressed={status === value}
              onClick={() => {
                setStatus(value);
                setPage(1);
                setSelected(undefined);
              }}
            >
              {value ? statusLabels[value] : "全部"}
            </Button>
          ))}
        </div>
        <div className="filter-project">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            options={projects.map(item => ({ value: item.id, label: item.name }))}
            placeholder="全部项目"
            style={{ width: 190 }}
            value={projectId}
            aria-label="筛选项目"
            onChange={value => {
              setProjectId(value);
              setPage(1);
              setSelected(undefined);
            }}
          />
          {!loading && !error && <span className="muted">共 {result.total} 条反馈</span>}
        </div>
      </div>

      <div className="feedback-layout">
        <section className="feedback-list" aria-busy={loading} aria-label="反馈列表">
          {error && (
            <Alert
              showIcon
              action={<Button onClick={() => void load()}>重试</Button>}
              description={error}
              title="反馈加载失败"
              type="error"
            />
          )}
          {!error && loading && (
            <div className="page-state">
              <Spin />
              <p className="muted">正在读取反馈…</p>
            </div>
          )}
          {!error && !loading && result.items.length === 0 && (
            <div className="page-state">
              <Empty
                description={projectId || status ? "当前筛选下没有反馈" : "还没有反馈。先在项目中复制 SDK 接入示例。"}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            </div>
          )}
          {!error &&
            !loading &&
            result.items.map(item => (
              <Button
                key={item.id}
                ref={node => {
                  if (node instanceof HTMLButtonElement && selected?.id === item.id) {
                    lastTrigger.current = node;
                  }
                }}
                className="feedback-card"
                type="default"
                aria-label={item.content.slice(0, 70)}
                aria-pressed={selected?.id === item.id}
                onClick={event => {
                  lastTrigger.current = event.currentTarget;
                  setSelected(item);
                }}
              >
                <span className="feedback-card-title">{item.content.slice(0, 140)}</span>
                <span className="feedback-card-meta">
                  <span>{item.projectName}</span>
                  <Tag className={`status-tag ${item.status}`}>{statusLabels[item.status]}</Tag>
                </span>
                <span className="contact-line">
                  {item.attachments.length ? `${item.attachments.length} 张图片 · ` : ""}
                  {item.contact || "未留联系方式"}
                </span>
                <span className="feedback-card-meta">
                  <time>{new Date(item.createdAt).toLocaleString()}</time>
                </span>
              </Button>
            ))}
        </section>
      </div>
      {!error && (
        <ListPagination
          disabled={loading}
          page={page}
          pageSize={pageSize}
          total={result.total}
          onChange={(value, size) => {
            setPage(value);
            setPageSize(size);
            setSelected(undefined);
          }}
        />
      )}
      <Drawer
        afterOpenChange={open => {
          if (!open) {
            lastTrigger.current?.focus({ preventScroll: true });
          }
        }}
        open={!!selected}
        styles={{ wrapper: { width: "min(620px, 100vw)" } }}
        title="反馈详情"
        onClose={close}
      >
        {detail}
      </Drawer>
    </div>
  );
}
