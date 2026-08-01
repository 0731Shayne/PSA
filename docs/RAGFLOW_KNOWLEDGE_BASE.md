# RAGFlow 课程资料库接入指南

## 这套集成解决什么问题

PSA 原来只有 1007 道结构化题库，适合按题号检索、推荐练习和展示标准解析。接入 RAGFlow 后，教师还可以把课程大纲、教材节选、讲义、例题和课堂说明做成可检索资料库。

这里不是把 RAGFlow 页面嵌进 PSA，而是清晰分工：

- PSA 管理账号、教师所有权、班级绑定、学生权限、辅导方式、会话和引用展示。
- RAGFlow 管理文件解析、切片、Embedding、向量索引和混合召回。
- 模型服务基于“结构化题库 + 已授权课程片段”生成回答。

当 `KNOWLEDGE_BACKEND=ragflow` 时，PSA 的 PostgreSQL 只保存 RAGFlow 数据集/文档 ID 和权限元数据，不保存另一份向量，因此不需要再单独引入 Chroma、Milvus 或 pgvector。本地作品模式的 SQLite 向量实现见 [本地简化 RAG 演示指南](LOCAL_RAG_DEMO.md)。

## Embedding 和向量化发生在哪里

教师上传文件后，调用链如下：

1. PSA 将文件上传到一个教师专属的 RAGFlow dataset。
2. PSA 请求 RAGFlow 开始解析。
3. RAGFlow 把文件解析成文本与结构块，再按 `chunk_method` 切片。
4. RAGFlow 使用 dataset 选择的 Embedding 模型把每个切片转换为向量，并写入其检索引擎。
5. 学生提问时，RAGFlow 把问题也转换成向量，结合关键词相似度返回最相关片段。
6. PSA 再把这些片段与题库上下文交给大模型组织答案。

所以答案是：会明确用到 Embedding 和向量化，但这些计算由 RAGFlow 负责，PSA 只通过 HTTP API 编排和控制权限。

## Embedding 模型建议

中文概率统计资料的第一版建议使用 `bge-m3`：它支持中英文和较长文本，适合本地部署与混合检索。若通过 Ollama 配到 RAGFlow，环境变量通常填写 RAGFlow 界面显示的完整模型标识，例如：

```ini
RAGFLOW_EMBEDDING_MODEL=bge-m3@Ollama
```

模型名称必须以实际 RAGFlow “Model providers”页面显示的标识为准。已有文档完成向量化后不要直接更换 dataset 的 Embedding 模型；需要比较新模型时，新建资料库、重新解析同一批文件，再用同一套评测问题比较。

选择时优先看真实召回质量，不要只看模型榜单：

- 准备 30—50 个学生真实问题，包含定义、公式差异、例题定位和口语化表达。
- 为每个问题人工标出应命中的文件和段落。
- 记录 Top-1、Top-3 命中率，以及错误召回是否会误导答案。
- 基线稳定后再考虑 Rerank；第一版 `RAGFLOW_RERANK_ID` 可以留空。

## 部署与配置

RAGFlow 资源需求明显高于 PSA，本仓库不会在 `backend/docker-compose.yml` 中重复部署它。请先按 [RAGFlow 官方仓库](https://github.com/infiniflow/ragflow)单独启动兼容版本，并在 RAGFlow 中：

1. 配置可用的聊天模型和 Embedding 模型。
2. 在用户设置中创建 HTTP API Key。
3. 确认 PSA 后端所在网络可以访问 RAGFlow 的 `9380` 端口或 HTTPS 域名。

然后修改 `backend/.env`：

```ini
KNOWLEDGE_BACKEND=ragflow
RAGFLOW_BASE_URL=http://localhost:9380
RAGFLOW_API_KEY=实际生成的APIKey
RAGFLOW_EMBEDDING_MODEL=bge-m3@Ollama
RAGFLOW_CHUNK_METHOD=book
RAGFLOW_TIMEOUT_SECONDS=30
RAGFLOW_VERIFY_SSL=true
RAGFLOW_USE_ENV_PROXY=false
RAGFLOW_RETRIEVAL_PAGE_SIZE=6
RAGFLOW_SIMILARITY_THRESHOLD=0.2
RAGFLOW_VECTOR_SIMILARITY_WEIGHT=0.5
RAGFLOW_TOP_K=256
```

如果 PSA 通过 Docker Compose 运行，而 RAGFlow 直接运行在同一台 Mac/Windows 宿主机，使用：

```ini
RAGFLOW_BASE_URL=http://host.docker.internal:9380
```

Linux 服务器应使用实际内网 DNS/IP，或在 Compose 中显式配置可解析的服务名。生产环境推荐 HTTPS 或受控内网；自签名证书应正确加入容器信任链，不建议把 `RAGFLOW_VERIFY_SSL` 长期设为 `false`。

配置完成后重启 PSA，教师登录并访问“课程资料库”。也可以请求：

```text
GET /api/knowledge/health
```

返回 `reachable: true` 才表示 API Key、地址和网络均可用。RAGFlow 是可选依赖，因此它不可用不会让 `/health/ready` 失败。

## 教师使用流程

1. 新建课程资料库，例如“概率论第一章”。
2. 上传 PDF、Word、PPT、Excel、Markdown、HTML 或纯文本资料。
3. 为每个文件选择类型：
   - `概念讲义`：定义、公式、课堂说明，可用于所有辅导方式。
   - `例题材料`：不包含完整最终答案的例题过程，可用于所有辅导方式。
   - `完整解答`：只在“完整解析”模式检索。
   - `教师专用`：学生永远不能检索或看到。
4. 等待状态变为“可检索”；解析失败时查看错误并重新提交。
5. 绑定一个或多个自己创建的活跃班级。
6. 用学生账号对真实问题做召回、引用和越权验证。

删除文档会先删除 RAGFlow 远端文档、切片和向量索引，再删除 PSA 本地权限元数据。远端删除失败时本地记录会保留，避免界面显示“已删”但实际索引仍存在。

## 权限与教学策略

检索前，后端先从数据库得到当前用户可使用的文档列表，再把明确的 `document_ids` 传给 RAGFlow。不会把整个 dataset 交给学生侧自由搜索。

| 当前用户/模式 | 可检索资料 |
|---|---|
| 教师，完整解析 | 自己资料库中所有已就绪文件 |
| 教师，提示/检查/分步 | 自己资料库中的概念与例题，不含完整解答和教师专用 |
| 学生，完整解析 | 所在活跃班级绑定且学生可见的概念、例题和完整解答 |
| 学生，提示/检查/分步 | 所在活跃班级绑定且学生可见的概念与例题 |

课程片段被视为“不可信证据”：提示词要求模型只使用其中的学科事实，并忽略任何改变角色、泄露系统提示或执行指令的文字。这是纵深防护，不能代替教师对资料来源的审核。

## 调参与验收

第一版先保持 `.env.example` 的默认参数：

- `page_size=6`：最多给模型 6 个片段，避免上下文噪声过大。
- `similarity_threshold=0.2`：先保证召回，再通过评测逐步提高。
- `vector_similarity_weight=0.5`：向量语义和关键词各占一半，公式名词与自然语言都能参与。
- `top_k=256`：RAGFlow 内部候选上限，不等于最终返回 256 条。

上线前至少完成：

- 教师 A 不能读取、绑定或删除教师 B 的资料库。
- 未加入班级的学生不能看到或检索资料。
- `teacher_only` 永不出现在学生响应中。
- 提示/分步模式不能召回完整解答。
- 回答下方能看到文件名、命中片段和匹配度。
- RAGFlow 停机、超时或返回错误时，题库问答仍可使用。
- 文档删除后，在 RAGFlow 中确认对应文档和切片均不存在。
- 使用包含“忽略系统指令”等文字的测试资料验证提示注入防护。

自动化覆盖位于 `backend/tests/test_ragflow_client.py` 和 `backend/tests/test_knowledge_base.py`。

## 主要 API

| PSA API | 用途 |
|---|---|
| `GET /api/knowledge/config` | 查看启用状态、Embedding 和文件限制 |
| `GET /api/knowledge/health` | 检查教师侧 RAGFlow 连接 |
| `GET/POST /api/knowledge/spaces` | 列出/创建资料库 |
| `POST /api/knowledge/spaces/{id}/documents` | 上传并启动解析 |
| `POST /api/knowledge/spaces/{id}/refresh` | 同步解析状态 |
| `PUT/DELETE /api/knowledge/spaces/{id}/classrooms/{classroom_id}` | 绑定/解绑班级 |
| `DELETE /api/knowledge/documents/{id}` | 删除文档及向量索引 |
| `POST /api/question-bank/assistant/stream` | 合并题库和课程资料进行流式辅导 |

RAGFlow API 适配集中在 `backend/src/integrations/ragflow_client.py`。若升级 RAGFlow 后 HTTP 响应结构发生变化，只需优先在这一层兼容并运行集成测试。
