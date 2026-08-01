# 本地简化 RAG 演示与企业交付指南

## 目标

本地版本不是用关键词检索假装 RAG，而是完整执行真实的简化链路：

```text
课程文件
  → 提取文字
  → 重叠分块
  → bge-m3 Embedding
  → SQLite 保存向量
  → 问题 Embedding
  → 余弦相似度 Top-K
  → 权限过滤后的资料片段
  → 大模型组织答案并显示引用
```

它适合个人电脑、面试演示和小规模课程资料；公司部署时通过环境变量切换到 RAGFlow，不需要重写教师页面、班级权限、辅导模式或引用展示。

## 使用了哪些算法

### 1. 文档解析

系统支持 PDF、DOCX、PPTX、XLSX、TXT、Markdown 和 HTML。解析后统一清理重复空白、换行与不可见字符。本地模式不支持旧版二进制 `.doc/.ppt/.xls`，应先转为现代格式。

### 2. 重叠分块

默认块大小为 900 个字符、重叠 120 个字符。系统优先在段落、句号或分号处截断；重叠区域用于避免定义或公式恰好落在两个块之间造成语义丢失。

### 3. Embedding

Ollama 运行 `bge-m3`。每个文本块和学生问题都被转换为固定维度浮点向量。PSA 调用的是 Ollama `/api/embed` 批量接口，不使用假向量或随机数。

### 4. 余弦相似度

查询向量 $q$ 与文本块向量 $d$ 的相关度为：

$$
\operatorname{sim}(q,d)=\frac{q\cdot d}{\lVert q\rVert\lVert d\rVert}
$$

系统过滤低于阈值的文本块，按相似度降序返回 Top-K。计算过程直接写在 Python 中，面试时可以完整解释，不依赖隐藏的向量数据库行为。

### 5. 权限先于检索

系统先根据教师所有权、班级绑定、学生可见性和辅导模式得到授权文档 ID，再从这些文档的切片中计算相似度。提示、检查和分步模式不会检索完整解答或教师专用资料。

## 在 MacBook Pro M3 Pro 上启动

你的 18GB 内存足够运行 PSA、Ollama 和 `bge-m3`。回答模型继续使用 DeepSeek API，不建议同时在本机运行大型生成模型。

安装 Ollama：

```bash
brew install ollama
brew services start ollama
```

后台服务会随用户登录启动。下载 Embedding 模型：

```bash
ollama pull bge-m3
ollama list
```

配置 `backend/.env`：

```ini
KNOWLEDGE_BACKEND=local
LOCAL_EMBEDDING_BASE_URL=http://localhost:11434
LOCAL_EMBEDDING_MODEL=bge-m3
LOCAL_EMBEDDING_BATCH_SIZE=16
LOCAL_CHUNK_SIZE=900
LOCAL_CHUNK_OVERLAP=120
RAGFLOW_SIMILARITY_THRESHOLD=0.2
RAGFLOW_RETRIEVAL_PAGE_SIZE=6
```

如果 PSA 运行在 Docker 而 Ollama 运行在 Mac 宿主机，改为：

```ini
LOCAL_EMBEDDING_BASE_URL=http://host.docker.internal:11434
```

启动 PSA 后，教师进入“课程资料库”，创建资料库并上传课程文件。`GET /api/knowledge/health` 会检查 Ollama 是否启动以及 `bge-m3` 是否已经安装。

## SQLite 中保存什么

- `knowledge_spaces`：教师资料库、后端类型和班级绑定。
- `knowledge_documents`：文件名、类型、权限、提取全文和处理状态。
- `knowledge_chunks`：文本块、顺序和 JSON 格式 Embedding 向量。

这种设计清楚、可测试、不需要安装额外向量数据库，但检索时会扫描授权文本块，因此只适合几百到几千个切片的作品演示，不适合企业百万级语料。

## 企业交付如何切换 RAGFlow

公司部署 RAGFlow 并创建 API Key 后修改：

```ini
KNOWLEDGE_BACKEND=ragflow
RAGFLOW_BASE_URL=https://公司RAGFlow地址
RAGFLOW_API_KEY=公司保管的APIKey
RAGFLOW_EMBEDDING_MODEL=bge-m3@Ollama
```

然后重新上传正式资料。已有本地 SQLite 向量不会伪装成 RAGFlow 索引，也不会自动传输；这是有意的数据边界。生产部署通常会使用全新的 PostgreSQL 和 RAGFlow 数据集。

保持不变的部分：

- 教师资料库管理页面
- 文件类型与学生可见性
- 班级绑定和用户权限
- 四种辅导方式
- 题库与课程资料混合上下文
- 回答引用、会话保存和故障降级

被替换的只有知识库后端：

| 能力 | 本地作品模式 | 企业 RAGFlow 模式 |
|---|---|---|
| 文档解析 | PSA Python 库 | RAGFlow DeepDoc |
| Embedding | Ollama `bge-m3` | RAGFlow 模型提供方 |
| 向量存储 | SQLite JSON | RAGFlow 检索引擎 |
| 相似度检索 | Python 余弦 Top-K | RAGFlow 混合检索/Rerank |
| 适用规模 | 小型演示 | 企业知识库 |

## 面试时如何表达

可以说明：

> 我先实现了一个可解释、可测试的本地 RAG 基线：文档解析、重叠切片、bge-m3 Embedding、SQLite 向量存储与余弦检索。业务层先做班级和资料权限过滤，再检索并向模型提供带来源片段。生产交付通过 provider adapter 切换到 RAGFlow，保留权限、辅导策略和引用协议。

不要描述成“我实现了 RAGFlow”。准确说法是“我实现了本地 RAG 基线，并完成了兼容 RAGFlow 的企业后端适配”。
