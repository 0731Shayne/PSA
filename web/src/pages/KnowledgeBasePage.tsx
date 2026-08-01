import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Skeleton,
  Tag,
  Upload,
  message,
} from "antd";
import type { UploadFile } from "antd";
import {
  CloudUploadOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  FileTextOutlined,
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";

interface KnowledgeConfig {
  enabled: boolean;
  backend: "disabled" | "local" | "ragflow";
  teacher: boolean;
  embedding_model: string;
  chunk_method: string;
  max_file_mb: number;
  allowed_extensions: string[];
}

interface KnowledgeDocument {
  id: number;
  filename: string;
  mime_type: string;
  size_bytes: number;
  material_type: "concept" | "example" | "solution" | "teacher_only";
  student_visible: boolean;
  status: "uploaded" | "pending" | "parsing" | "ready" | "cancelled" | "failed" | "missing" | "unknown";
  last_error?: string;
  created_at?: string;
}

interface KnowledgeSpace {
  id: number;
  name: string;
  description: string;
  status: "creating" | "ready" | "failed";
  backend: "local" | "ragflow";
  last_error?: string;
  embedding_model?: string;
  classroom_ids: number[];
  documents: KnowledgeDocument[];
}

interface Classroom {
  id: number;
  name: string;
  status: "active" | "archived";
}

const materialLabels: Record<KnowledgeDocument["material_type"], string> = {
  concept: "概念讲义",
  example: "例题材料",
  solution: "完整解答",
  teacher_only: "教师专用",
};

const statusMeta: Record<string, { label: string; color: string }> = {
  uploaded: { label: "已上传", color: "blue" },
  pending: { label: "等待解析", color: "blue" },
  parsing: { label: "解析中", color: "processing" },
  ready: { label: "可检索", color: "green" },
  cancelled: { label: "解析已取消", color: "orange" },
  failed: { label: "解析失败", color: "red" },
  missing: { label: "远端缺失", color: "orange" },
};

function errorDetail(error: unknown, fallback: string) {
  return (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;
}

function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function KnowledgeBasePage() {
  const { user, isDemo } = useAuth();
  const teacher = user?.role === "teacher";
  const [config, setConfig] = useState<KnowledgeConfig | null>(null);
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedId, setSelectedId] = useState<number>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [createForm] = Form.useForm();
  const [uploadForm] = Form.useForm();

  const selected = useMemo(
    () => spaces.find(item => item.id === selectedId) || spaces[0],
    [spaces, selectedId],
  );

  async function load(preferredId?: number) {
    if (!teacher || isDemo) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [configResponse, spaceResponse, classroomResponse] = await Promise.all([
        apiClient.get<KnowledgeConfig>("/api/knowledge/config"),
        apiClient.get<KnowledgeSpace[]>("/api/knowledge/spaces"),
        apiClient.get<Classroom[]>("/api/classrooms"),
      ]);
      setConfig(configResponse.data);
      setSpaces(spaceResponse.data);
      setClassrooms(classroomResponse.data);
      const nextId = preferredId || selectedId || spaceResponse.data[0]?.id;
      setSelectedId(spaceResponse.data.some(item => item.id === nextId) ? nextId : spaceResponse.data[0]?.id);
    } catch (error) {
      message.error(errorDetail(error, "课程资料库加载失败，请检查服务连接"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Load once for the authenticated role; mutations explicitly refresh data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacher, isDemo]);

  if (!teacher) {
    return <Alert type="info" showIcon message="课程资料由教师统一维护" description="你可以直接在智能答疑中使用教师发布到所在班级的资料，并查看回答引用的文件片段。" />;
  }

  if (isDemo) {
    return <div className="mx-auto max-w-5xl"><h1 className="text-2xl font-bold text-slate-950">课程资料库</h1><Alert className="mt-6" type="info" showIcon message="模拟演示不上传真实文件" description="正式部署并配置 RAGFlow 后，教师可在这里创建资料库、上传 PDF/Office/Markdown 讲义、等待解析，并绑定给指定班级。" /></div>;
  }

  async function createSpace(values: { name: string; description?: string }) {
    setBusy(true);
    try {
      const response = await apiClient.post<KnowledgeSpace>("/api/knowledge/spaces", values);
      message.success("资料库已创建，可以上传课程文件了");
      setCreateOpen(false);
      createForm.resetFields();
      await load(response.data.id);
    } catch (error) {
      message.error(errorDetail(error, "资料库创建失败，请检查 RAGFlow 配置"));
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function retrySpace(spaceId: number) {
    setBusy(true);
    try {
      await apiClient.post(`/api/knowledge/spaces/${spaceId}/retry`);
      message.success("资料库连接已恢复");
      await load(spaceId);
    } catch (error) {
      message.error(errorDetail(error, "重试失败，请检查 RAGFlow 服务"));
    } finally {
      setBusy(false);
    }
  }

  async function deleteSpace(spaceId: number) {
    setBusy(true);
    try {
      await apiClient.delete(`/api/knowledge/spaces/${spaceId}`);
      message.success("资料库及远端索引已删除");
      setSelectedId(undefined);
      await load();
    } catch (error) {
      message.error(errorDetail(error, "资料库删除失败，数据仍然保留"));
    } finally {
      setBusy(false);
    }
  }

  async function updateClassrooms(nextIds: number[]) {
    if (!selected) return;
    const previous = new Set(selected.classroom_ids);
    const next = new Set(nextIds);
    setBusy(true);
    try {
      await Promise.all([
        ...nextIds.filter(id => !previous.has(id)).map(id => apiClient.put(`/api/knowledge/spaces/${selected.id}/classrooms/${id}`)),
        ...selected.classroom_ids.filter(id => !next.has(id)).map(id => apiClient.delete(`/api/knowledge/spaces/${selected.id}/classrooms/${id}`)),
      ]);
      message.success("班级可见范围已更新");
      await load(selected.id);
    } catch (error) {
      message.error(errorDetail(error, "班级绑定更新失败，请重试"));
    } finally {
      setBusy(false);
    }
  }

  async function uploadDocument(values: { material_type: KnowledgeDocument["material_type"]; student_visible: boolean }) {
    const file = fileList[0]?.originFileObj;
    if (!selected || !file) {
      message.warning("请先选择一个课程文件");
      return;
    }
    const data = new FormData();
    data.append("file", file);
    data.append("material_type", values.material_type);
    data.append("student_visible", String(values.student_visible));
    setBusy(true);
    try {
      await apiClient.post(`/api/knowledge/spaces/${selected.id}/documents`, data, {
        timeout: 120_000,
      });
      message.success("文件已上传，正在解析、切分并生成 Embedding 向量");
      setUploadOpen(false);
      setFileList([]);
      uploadForm.resetFields();
      await load(selected.id);
    } catch (error) {
      message.error(errorDetail(error, "文件上传或解析启动失败"));
      await load(selected.id);
    } finally {
      setBusy(false);
    }
  }

  async function refreshDocuments() {
    if (!selected) return;
    setBusy(true);
    try {
      await apiClient.post(`/api/knowledge/spaces/${selected.id}/refresh`);
      await load(selected.id);
      message.success("文档解析状态已同步");
    } catch (error) {
      message.error(errorDetail(error, "状态同步失败，请检查 RAGFlow 服务"));
    } finally {
      setBusy(false);
    }
  }

  async function retryDocument(documentId: number) {
    setBusy(true);
    try {
      await apiClient.post(`/api/knowledge/documents/${documentId}/retry`);
      message.success("已重新提交解析任务");
      await load(selected?.id);
    } catch (error) {
      message.error(errorDetail(error, "文档重新解析失败"));
    } finally {
      setBusy(false);
    }
  }

  async function deleteDocument(documentId: number) {
    setBusy(true);
    try {
      await apiClient.delete(`/api/knowledge/documents/${documentId}`);
      message.success("文件及其向量索引已删除");
      await load(selected?.id);
    } catch (error) {
      message.error(errorDetail(error, "文件删除失败，数据仍然保留"));
    } finally {
      setBusy(false);
    }
  }

  const readyCount = selected?.documents.filter(item => item.status === "ready").length || 0;
  const processingCount = selected?.documents.filter(item => item.status === "pending" || item.status === "parsing" || item.status === "uploaded").length || 0;

  return <div className="mx-auto max-w-[1280px]">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-slate-950">课程资料库</h1><p className="mt-1 max-w-3xl text-base leading-7 text-slate-600">把讲义、教材和例题解析、切分并转换成 Embedding 向量；本地演示使用 SQLite 余弦检索，企业部署可切换到 RAGFlow。</p></div>
      <div className="flex gap-2"><Button icon={<ReloadOutlined />} onClick={() => load(selected?.id)} loading={loading}>刷新</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)} disabled={!config?.enabled}>新建资料库</Button></div>
    </div>

    {config && !config.enabled && <Alert className="mt-5" type="warning" showIcon message="课程资料检索尚未启用" description="将 KNOWLEDGE_BACKEND 配置为 local 或 ragflow；关闭时原有题库答疑不受影响。" />}
    {config?.backend === "local" && <Alert className="mt-5" type="info" showIcon message="本地作品演示模式" description="Ollama + bge-m3 生成真实 Embedding，向量保存在 SQLite 并由 Python 计算余弦相似度；企业交付时切换到 RAGFlow。" />}
    {config?.enabled && <section className="mt-5 grid gap-3 border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"><div><div className="text-sm text-slate-500">检索后端</div><div className="mt-1 font-semibold text-slate-900">{config.backend === "local" ? "本地 SQLite 向量" : "RAGFlow"}</div></div><div><div className="text-sm text-slate-500">Embedding 模型</div><div className="mt-1 font-semibold text-slate-900">{config.embedding_model}</div></div><div><div className="text-sm text-slate-500">文档切分策略</div><div className="mt-1 font-semibold text-slate-900">{config.chunk_method}</div></div><div><div className="text-sm text-slate-500">单文件限制</div><div className="mt-1 font-semibold text-slate-900">{config.max_file_mb} MB</div></div></section>}

    {loading ? <div className="mt-6"><Skeleton active paragraph={{ rows: 10 }} /></div> : spaces.length === 0 ? <section className="mt-6 flex min-h-80 flex-col items-center justify-center border border-slate-200 bg-white px-6 text-center"><DatabaseOutlined className="text-4xl text-teal-700" /><h2 className="mt-4 text-lg font-bold text-slate-900">创建第一套课程资料库</h2><p className="mt-2 max-w-xl leading-7 text-slate-600">建议先上传课程大纲、概念讲义和例题，再用 10—20 个真实问题检查召回质量。完整答案要单独标记，避免在提示模式中提前泄露。</p><Button className="mt-5" type="primary" onClick={() => setCreateOpen(true)} disabled={!config?.enabled}>新建资料库</Button></section> : <div className="mt-6 grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="overflow-hidden border border-slate-200 bg-white"><div className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-700">我的资料库</div><div className="divide-y divide-slate-100">{spaces.map(space => <button key={space.id} onClick={() => setSelectedId(space.id)} className={`block w-full px-4 py-4 text-left transition ${selected?.id === space.id ? "bg-teal-50" : "hover:bg-slate-50"}`}><div className="flex items-start justify-between gap-2"><span className="font-bold text-slate-900">{space.name}</span><Tag color={space.status === "ready" ? "green" : space.status === "failed" ? "red" : "processing"} className="!mr-0">{space.status === "ready" ? "已连接" : space.status === "failed" ? "连接失败" : "创建中"}</Tag></div><p className="mt-2 text-sm text-slate-500">{space.documents.length} 个文件 · {space.classroom_ids.length} 个班级</p></button>)}</div></aside>

      {selected && <main className="min-w-0 border border-slate-200 bg-white">
        <header className="border-b border-slate-200 px-5 py-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold text-slate-950">{selected.name}</h2><Tag color={selected.backend === "local" ? "geekblue" : "purple"}>{selected.backend === "local" ? "本地向量" : "RAGFlow"}</Tag>{selected.embedding_model && <Tag color="cyan">{selected.embedding_model}</Tag>}</div><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{selected.description || "尚未填写资料库说明"}</p></div><div className="flex gap-2">{selected.status === "failed" && <Button icon={<SyncOutlined />} onClick={() => retrySpace(selected.id)} loading={busy}>重试连接</Button>}<Popconfirm title="删除这个资料库？" description={selected.backend === "local" ? "本地提取文本、切片和 Embedding 向量都会删除，且无法恢复。" : "RAGFlow 中的文档和向量索引也会删除，且无法恢复。"} okText="删除" cancelText="取消" onConfirm={() => deleteSpace(selected.id)}><Button danger icon={<DeleteOutlined />} disabled={busy}>删除</Button></Popconfirm></div></div>{selected.last_error && <Alert className="mt-4" type="error" showIcon message="资料库当前不可用" description={selected.last_error} />}</header>

        <section className="grid gap-5 border-b border-slate-200 px-5 py-5 md:grid-cols-[1fr_240px] md:items-end"><div><label className="mb-2 block text-sm font-bold text-slate-700" htmlFor="knowledge-classrooms"><LinkOutlined className="mr-1" />允许哪些班级检索</label><Select id="knowledge-classrooms" mode="multiple" className="w-full" value={selected.classroom_ids} onChange={updateClassrooms} loading={busy} placeholder="未绑定时仅教师本人可使用" options={classrooms.map(item => ({ value: item.id, label: item.status === "archived" ? `${item.name}（已归档）` : item.name, disabled: item.status === "archived" }))} /></div><div><div className="mb-2 flex justify-between text-sm text-slate-600"><span>可检索文档</span><span>{readyCount}/{selected.documents.length}</span></div><Progress percent={selected.documents.length ? Math.round(readyCount / selected.documents.length * 100) : 0} showInfo={false} strokeColor="#0f766e" />{processingCount > 0 && <div className="mt-1 text-xs text-amber-700">{processingCount} 个文件仍在解析</div>}</div></section>

        <section><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><h3 className="font-bold text-slate-900">课程文件</h3><p className="mt-1 text-sm text-slate-500">提示和分步模式不会检索“完整解答”与“教师专用”文件。</p></div><div className="flex gap-2"><Button icon={<ReloadOutlined />} onClick={refreshDocuments} loading={busy} disabled={!selected.documents.length}>同步状态</Button><Button type="primary" icon={<CloudUploadOutlined />} onClick={() => setUploadOpen(true)} disabled={selected.status !== "ready"}>上传文件</Button></div></div>{selected.documents.length === 0 ? <Empty className="!my-12" image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有课程文件" /> : <div className="divide-y divide-slate-100">{selected.documents.map(document => { const meta = statusMeta[document.status] || { label: document.status, color: "default" }; return <article key={document.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center"><div className="min-w-0"><div className="flex min-w-0 flex-wrap items-center gap-2"><FileTextOutlined className="text-teal-700" /><span className="max-w-full truncate font-semibold text-slate-900">{document.filename}</span><Tag color={meta.color}>{meta.label}</Tag><Tag>{materialLabels[document.material_type]}</Tag>{document.student_visible ? <Tag color="blue">学生可见</Tag> : <Tag>仅教师可见</Tag>}</div><p className="mt-1 text-sm text-slate-500">{fileSize(document.size_bytes)}{document.created_at ? ` · ${new Date(document.created_at).toLocaleString("zh-CN")}` : ""}</p>{document.last_error && <p className="mt-1 break-words text-sm text-rose-600">{document.last_error}</p>}</div><div className="text-sm text-slate-500">{document.status === "ready" ? "已切分并建立向量索引" : document.status === "parsing" || document.status === "pending" ? "解析、切分与向量化进行中" : "暂不可用于问答"}</div><div className="flex justify-end gap-1">{(["failed", "missing", "cancelled", "unknown"] as string[]).includes(document.status) && <Button type="link" onClick={() => retryDocument(document.id)} disabled={busy}>重新解析</Button>}<Popconfirm title="删除这个文件？" description="对应的切片和向量索引也会删除。" okText="删除" cancelText="取消" onConfirm={() => deleteDocument(document.id)}><Button danger type="text" icon={<DeleteOutlined />} aria-label={`删除 ${document.filename}`} disabled={busy} /></Popconfirm></div></article>; })}</div>}</section>
      </main>}
    </div>}

    <Modal title="新建课程资料库" open={createOpen} onCancel={() => setCreateOpen(false)} footer={null} destroyOnHidden><Form form={createForm} layout="vertical" onFinish={createSpace}><Form.Item name="name" label="资料库名称" rules={[{ required: true, message: "请输入资料库名称" }]}><Input maxLength={128} placeholder="如：概率论第一章课程资料" /></Form.Item><Form.Item name="description" label="用途说明"><Input.TextArea maxLength={4000} rows={4} placeholder="说明课程范围、资料版本和适用班级" /></Form.Item><Alert className="mb-5" type="info" showIcon message={config?.backend === "local" ? "将创建本地 SQLite 向量资料库" : "将在 RAGFlow 中建立对应数据集"} description={`Embedding 模型：${config?.embedding_model || "使用后端默认值"}`} /><Button block type="primary" htmlType="submit" loading={busy}>创建资料库</Button></Form></Modal>

    <Modal title="上传课程文件" open={uploadOpen} onCancel={() => { setUploadOpen(false); setFileList([]); }} footer={null} destroyOnHidden><Form form={uploadForm} layout="vertical" initialValues={{ material_type: "concept", student_visible: true }} onFinish={uploadDocument}><Form.Item label="选择文件" required><Upload.Dragger fileList={fileList} maxCount={1} beforeUpload={() => false} onChange={({ fileList: next }) => setFileList(next.slice(-1))} accept={config?.allowed_extensions.join(",")}><p className="ant-upload-drag-icon"><CloudUploadOutlined /></p><p className="ant-upload-text">点击或拖入 PDF、Office、Markdown 等课程资料</p><p className="ant-upload-hint">单文件最大 {config?.max_file_mb || 64} MB；上传后会自动开始解析、切分与向量化</p></Upload.Dragger></Form.Item><Form.Item name="material_type" label="资料类型" rules={[{ required: true }]}><Select onChange={value => { if (value === "teacher_only") uploadForm.setFieldValue("student_visible", false); }} options={Object.entries(materialLabels).map(([value, label]) => ({ value, label }))} /></Form.Item><Form.Item noStyle shouldUpdate={(previous, current) => previous.material_type !== current.material_type}>{({ getFieldValue }) => <Form.Item name="student_visible" valuePropName="checked"><Checkbox disabled={getFieldValue("material_type") === "teacher_only"}>允许学生在引用来源中看到文件名与命中片段</Checkbox></Form.Item>}</Form.Item><Alert className="mb-5" type="warning" showIcon message={config?.backend === "local" ? "本地模式会将提取文本和向量保存在 PSA SQLite 数据库" : "资料会发送到你配置的 RAGFlow 服务"} description="不要上传超出课程授权范围的个人信息、密钥或版权受限文件。" /><Button block type="primary" htmlType="submit" loading={busy} disabled={!fileList.length}>上传并开始解析</Button></Form></Modal>
  </div>;
}
