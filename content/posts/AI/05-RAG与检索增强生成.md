---
title: "RAG与检索增强生成"
date: 2026-06-01
categories: ["AI"]
tags: ["RAG", "检索增强", "向量数据库"]
series: "AI应用开发面试宝典"
toc: true
weight: 6
---

# RAG与检索增强生成面试知识

## 一、概述

检索增强生成（Retrieval-Augmented Generation，RAG）是2024-2026年间大模型落地的核心范式。RAG通过在生成前检索外部知识库中的相关信息，有效解决LLM的知识截止、幻觉和领域知识不足等关键问题。随着模型上下文窗口的扩展（128K-1M tokens）和Agent范式的兴起，RAG技术也在快速演进——从简单的Retrieve-Read到Self-RAG、GraphRAG、Agentic RAG等高级形态。面试中需要系统掌握RAG的全链路知识，包括架构设计、向量数据库、Embedding、检索策略、重排序、评估等。

---

## 二、知识点详解

### 1. RAG架构

#### 1.1 基础架构：Retrieve-Read

最简单的RAG架构：用户查询 → 检索相关文档 → 将文档作为上下文注入Prompt → LLM生成回答。

```python
# 基础Retrieve-Read流程
def simple_rag(query, vector_store, llm):
    # Step 1: 检索
    retrieved_docs = vector_store.similarity_search(query, k=5)
    
    # Step 2: 组合上下文
    context = "\n\n".join([doc.page_content for doc in retrieved_docs])
    
    # Step 3: 生成
    prompt = f"""基于以下参考内容回答问题：

参考内容：
{context}

问题：{query}

回答："""
    response = llm.invoke(prompt)
    return response
```

**优缺点**：实现简单，但对噪声文档敏感，无法处理复杂的多步推理。

#### 1.2 Retrieve-Read-Rerank（检索-读取-重排序）

在检索和生成之间增加Reranker重排序环节，提升检索质量。

```python
def rag_with_rerank(query, vector_store, reranker, llm, top_k=10, rerank_top_k=3):
    # Step 1: 初步检索（召回更多文档）
    retrieved_docs = vector_store.similarity_search(query, k=top_k)
    
    # Step 2: 重排序
    reranked = reranker.rerank(query, retrieved_docs)
    best_docs = reranked[:rerank_top_k]
    
    # Step 3: 生成
    context = "\n\n".join([doc.page_content for doc in best_docs])
    prompt = f"...{context}...{query}..."
    return llm.invoke(prompt)
```

#### 1.3 Iterative Retrieval（迭代检索）

多次检索，每次根据已生成的部分结果调整检索策略。

**多轮检索**（Multi-Hop RAG）：第一个查询的检索结果引导第二个查询。

```python
def multi_hop_rag(query, vector_store, llm, max_hops=3):
    context = ""
    current_query = query
    
    for hop in range(max_hops):
        # 检索
        docs = vector_store.similarity_search(current_query, k=3)
        context = "\n\n".join([doc.page_content for doc in docs])
        
        # 判断是否需要继续检索
        next_query = llm.invoke(
            f"基于当前信息：{context}\n原始问题：{query}\n"
            f"是否还需要更多信息才能完整回答问题？如果需要，请生成下一个查询。"
        )
        
        if "不需要" in next_query or "no" in next_query.lower():
            break
        current_query = next_query
    
    # 最终回答
    return llm.invoke(f"基于以下信息回答问题：{context}\n问题：{query}")
```

**其他迭代变体**：
- **Corrective RAG**：评估检索结果质量，必要时重新检索
- **Self-RAG**：在生成过程中自我评估是否需要检索以及检索结果是否相关

#### 1.4 2025-2026年RAG架构趋势

- **Agentic RAG**：Agent自主决定何时检索、使用何种检索策略、以及是否需要多步检索
- **GraphRAG**：基于知识图谱的RAG，支持跨实体推理
- **Adaptive RAG**：根据查询复杂度自适应选择检索策略（简单查询直接生成，复杂查询多步检索）
- **Streaming RAG**：检索结果边到达边生成，降低端到端延迟

---

### 2. 向量数据库对比

#### 2.1 核心指标对比

| 特性 | FAISS | Pinecone | Weaviate | Milvus | Chroma | Qdrant |
|------|-------|----------|----------|--------|--------|--------|
| 部署方式 | 本地/内存 | SaaS | 自托管/SaaS | 自托管 | 本地/内存 | 自托管/SaaS |
| 索引算法 | IVF/HNSW | HNSW | HNSW | IVF/HNSW | HNSW | HNSW |
| 持久化 | ❌ | ✅ | ✅ | ✅ | ✅(磁盘) | ✅ |
| 分布式 | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 过滤标量 | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 混合搜索 | ❌ | ✅(2024) | ✅ | ✅ | ❌ | ✅ |
| 安装复杂度 | 简单 | 简单 | 中等 | 复杂 | 极简 | 简单 |
| 社区版限制 | 无 | 1GB免费 | 有限制 | 无 | 无 | 1GB免费 |
| 主流用途 | 原型/研究 | 生产 | 通用 | 大规模 | 原型/本地 | 生产 |

#### 2.2 各库详解

**FAISS（Facebook AI Similarity Search）**
- 最成熟的向量搜索库，不是数据库（无持久化）
- 支持多种索引（IndexFlatIP、IndexIVFFlat、IndexHNSWFlat等）
- 2025年：FAISS GPU加速版本成熟，支持10亿级向量搜索
- 适用：研究、原型、对持久化无要求的小规模场景

```python
import faiss
import numpy as np

dim = 768  # 向量维度
index = faiss.IndexFlatIP(dim)  # 内积索引（余弦相似度）
vectors = np.random.random((10000, dim)).astype('float32')
index.add(vectors)
D, I = index.search(np.random.random((1, dim)).astype('float32'), k=5)
```

**Pinecone**
- 全托管的SaaS向量数据库，零运维
- 2024年新增混合搜索（稀疏+密集向量）
- 支持metadata过滤、命名空间隔离
- 适用：不想自建基础设施的生产场景

**Weaviate**
- 开源向量数据库，支持原生GraphQL接口
- 内置模块化向量化功能（集成OpenAI/Cohere/HuggingFace）
- 2025年新增：多租户支持、Improved Hybrid Search
- 适用：需要灵活Schema和GraphQL查询的场景

**Milvus**
- 专为大规模向量检索设计的分布式数据库
- GPU加速版本（Milvus GPU）支持亿级向量毫秒级检索
- 2025年：Milvus 3.0引入存算分离架构，支持Serverless
- 适用：大规模生产环境（>1000万向量）

**Chroma**
- 极简嵌入式向量数据库，追求开发体验
- 2025年更新：磁盘持久化稳定版、改进的集合管理
- 适用：原型开发、小型项目、本地开发

**Qdrant**
- Rust编写的向量数据库，性能优异
- 2025年：Qdrant 1.12+引入稀疏向量原生支持
- 过滤和分页功能完备
- 适用：对性能要求高的生产场景

---

### 3. Embedding模型选型

#### 3.1 主流Embedding模型对比

| 模型 | 维度 | 最大长度 | 支持语言 | 价格 | 性能(MTEB) |
|------|------|---------|---------|------|-----------|
| OpenAI text-embedding-3-large | 3072 | 8191 | 多语言 | $0.13/1M tokens | 64.6 |
| OpenAI text-embedding-3-small | 1536 | 8191 | 多语言 | $0.02/1M tokens | 62.3 |
| BGE-M3 (BAAI) | 1024 | 8192 | 多语言 | 免费/开源 | 64.0 |
| BGE-large-EN-v1.5 | 1024 | 512 | 英文 | 免费/开源 | 64.2 |
| BGE-large-ZH-v1.5 | 1024 | 512 | 中文 | 免费/开源 | 中文本最佳 |
| E5-mistral-7b-instruct | 4096 | 4096 | 英文 | 免费/开源 | 66.6 |
| Cohere Embed v3 | 1024 | 512 | 多语言 | $0.10/1K units | 64.8 |
| Jina Embedding v3 | 1024 | 8192 | 多语言 | 免费/开源 | 64.2 |
| jina-embeddings-v3 (2025) | 1024 | 8192 | 多语言(89种) | 免费/开源 | 66.0 |
| voyage-lite-02-instruct | 1024 | 16000 | 多语言 | $0.10/1M tokens | 65.5 |

#### 3.2 选型策略

**1. 按语言选择**
- 中文为主：BGE-large-ZH-v1.5、BGE-M3、Jina v3、OpenAI text-embedding-3
- 英文为主：E5-mistral、BGE-large-EN-v1.5、Cohere Embed v3
- 多语言混合：BGE-M3、Jina v3、OpenAI text-embedding-3

**2. 按维度选择**
- 高维度（3072/4096）：精度更高，但存储和检索成本高
- 低维度（768/1024）：速度更快，存储成本低
- 维度缩减：OpenAI支持通过`dimensions`参数缩减维度

**3. 2025年新趋势**
- **Matryoshka Embedding**（OpenAI、Nomic）：单一向量支持多维度输出，根据精度需求动态选择
- **Instruct Embedding**：通过指令调整嵌入偏向，如voyage-lite-02-instruct
- **Late Interaction**（ColBERT系列）：保留Token级交互信息，提升检索精度
- **领域专用Embedding**：针对代码、医疗、法律等垂直领域微调的Embedding模型

```python
# 使用BGE-M3（2025年推荐的多语言模型）
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("BAAI/bge-m3")
embeddings = model.encode(["今天天气真好", "深度学习框架对比"])

# Matryoshka维度缩减
from sentence_transformers import SentenceTransformer
model = SentenceTransformer("nomic-ai/nomic-embed-text-v1.5")
embeddings = model.encode(["text"], normalize_embeddings=True)
# 通过截断向量维度来缩减
short_embeddings = embeddings[:, :256]  # 取前256维
```

---

### 4. Chunking策略

Chunking（文本分块）是RAG管线的第一步，直接影响检索质量。

#### 4.1 Fixed-size Chunking（固定大小分块）

最简单的方法，按固定的字符数或token数切分，通常带重叠。

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=512,      # 每个块的大小（字符数）
    chunk_overlap=50,    # 相邻块重叠字符数
    separators=["\n\n", "\n", "。", ".", " ", ""]  # 优先在自然边界切分
)
chunks = text_splitter.split_text(long_text)
```

**参数调优**：
- chunk_size：256-1024字符常见，根据文档类型和检索任务调整
- chunk_overlap：通常为chunk_size的10-20%
- 分隔符优先级：段落 > 句子 > 词组 > 字符

#### 4.2 Semantic Chunking（语义分块）

根据语义边界（主题变化、段落结束）进行切分，不固定长度。

```python
from langchain_experimental.text_splitter import SemanticChunker
from langchain_openai.embeddings import OpenAIEmbeddings

semantic_splitter = SemanticChunker(
    embeddings=OpenAIEmbeddings(),
    breakpoint_threshold_type="percentile",  # percentile/standard_deviation/interquartile
    breakpoint_threshold_amount=95,  # 百分位阈值
)

chunks = semantic_splitter.split_text(long_text)
```

**2025年语义分块方法**：
- **Embedding-based**：计算句子间embedding相似度，在相似度突降处切分
- **LLM-based**：用LLM判断语义边界（准确但成本高）
- **Model-based**：使用专用分块模型（如Jina AI的Segmentation模型）

#### 4.3 Agentic Chunking（智能分块）

2024-2025年出现的新范式：让AI Agent根据需要动态决定如何分块和聚合。

```python
# Agentic Chunking 思路（伪代码）
def agentic_chunking(document, llm):
    # 1. 分析文档结构
    structure = llm.analyze(f"分析这个文档的结构：{document[:1000]}...")
    
    # 2. 根据结构制定分块策略
    if structure == "技术文档":
        chunks = split_by_section(document)
    elif structure == "小说":
        chunks = split_by_chapter(document)
    elif structure == "表格数据":
        chunks = split_by_row_group(document)
    
    # 3. 为每个块生成摘要和标签
    for chunk in chunks:
        chunk.summary = llm.summarize(chunk)
        chunk.tags = llm.extract_tags(chunk)
    
    return chunks
```

#### 4.4 Chunking选型建议

| 场景 | 推荐策略 | chunk_size | 备注 |
|------|---------|-----------|------|
| 问答系统 | Semantic Chunking | 512-1024 | 语义完整性好 |
| 代码库 | Fixed-size (按函数/类) | 256-512 | 保持代码结构 |
| 长文档总结 | Agentic Chunking | 灵活 | 根据文档结构定制 |
| 搜索引擎 | Fixed-size + 重叠 | 256-512 | 高召回率 |
| 法律/医疗文档 | Semantic Chunking | 1024-2048 | 保留完整条款 |

---

### 5. 检索策略

#### 5.1 Dense Retrieval（密集检索）

使用Embedding模型将文本映射到向量空间，通过向量相似度检索。
- 优点：语义理解能力强，能匹配同义词和近义表达
- 缺点：需要训练Embedding模型，对领域术语可能不敏感
- 相似度度量：余弦相似度(Cosine)、内积(IP)、欧氏距离(L2)

#### 5.2 Sparse Retrieval（稀疏检索）- BM25

基于关键词匹配的经典检索算法，TF-IDF的改进版。
- 优点：精确匹配、对罕见词敏感、无需训练、可解释性强
- 缺点：语义鸿沟（无法处理同义词）、无法处理拼写变体

```python
# BM25检索
from rank_bm25 import BM25Okapi

tokenized_corpus = [doc.split() for doc in documents]
bm25 = BM25Okapi(tokenized_corpus)
scores = bm25.get_scores(query.split())
```

#### 5.3 Hybrid Search（混合搜索）

结合Dense和Sparse检索的优势，使用加权融合策略。

```python
def hybrid_search(query, dense_encoder, bm25, vector_index, 
                  alpha=0.5, top_k=10):
    # Dense检索
    query_vec = dense_encoder.encode(query)
    dense_scores, dense_indices = vector_index.search(query_vec, k=top_k)
    
    # Sparse检索
    bm25_scores = bm25.get_scores(query.split())
    sparse_indices = np.argsort(bm25_scores)[::-1][:top_k]
    
    # 分数归一化 + 加权融合（RRF或加权和）
    combined_scores = {}
    for i, idx in enumerate(dense_indices[0]):
        combined_scores[idx] = combined_scores.get(idx, 0) + alpha * (1 - i/top_k)
    for i, idx in enumerate(sparse_indices):
        combined_scores[idx] = combined_scores.get(idx, 0) + (1-alpha) * (1 - i/top_k)
    
    # 按综合得分排序
    ranked = sorted(combined_scores.items(), key=lambda x: x[1], reverse=True)
    return [documents[idx] for idx, _ in ranked[:top_k]]
```

**RRF（Reciprocal Rank Fusion）**：混合搜索中最推荐的融合算法
```python
# RRF融合：不依赖分数绝对值，更鲁棒
def rrf_fusion(dense_results, sparse_results, k=60):
    scores = {}
    for rank, doc_id in enumerate(dense_results):
        scores[doc_id] = scores.get(doc_id, 0) + 1 / (k + rank + 1)
    for rank, doc_id in enumerate(sparse_results):
        scores[doc_id] = scores.get(doc_id, 0) + 1 / (k + rank + 1)
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)
```

#### 5.4 2025年检索趋势
- **Late Interaction**（ColBERTv2）：保留Token级交互，兼顾速度和精度
- **Sparse-Dense Hybrid**（如Splade）：学习生成稀疏向量，结合BM-like和Dense优势
- **多向量检索**（MRL、Matryoshka Embedding）：不同精度需求的维度适配
- **多模态检索**：图文统一向量空间

---

### 6. Reranker（重排序）

Reranker 对初步检索结果进行精细化排序，通常使用Cross-Encoder架构。

#### 6.1 Cross-Encoder Reranker

与Bi-Encoder不同，Cross-Encoder同时处理Query和Document，精度更高但速度慢。

```python
from sentence_transformers import CrossEncoder

# BGE Reranker（推荐中文场景）
reranker = CrossEncoder("BAAI/bge-reranker-v2-m3")
pairs = [(query, doc) for doc in docs]
scores = reranker.predict(pairs)
sorted_docs = [doc for _, doc in sorted(zip(scores, docs), reverse=True)]
```

#### 6.2 主流Reranker模型

| 模型 | 优点 | 适用场景 |
|------|------|---------|
| Cohere Rerank v3 | 多语言、稳定、SaaS | 生产环境（付费） |
| BGE Reranker v2 | 免费、中文优秀 | 自托管 |
| BGE Reranker v2-M3 | 支持多语言、长文本 | 多语言场景 |
| Cross-Encoder (ms-marco) | 快速、英文好 | 英文搜索 |
| Jina Reranker | 长上下文支持(8K) | 长文档重排 |
| Voyage Rerank | 质量高 | 追求极致精度 |

#### 6.3 Reranker使用策略

- **两阶段检索**：第一段用Bi-Encoder召回Top-50~100，第二段用Cross-Encoder重排Top-3~5
- **延迟预算**：Cross-Encoder比Bi-Encoder慢10-100倍，仅对Top-N重排
- **嵌入Reranker**：如Cohere Rerank，返回相关性分数而非排序，可用于过滤

---

### 7. Advanced RAG技术

#### 7.1 Self-RAG

2023年由Asai等人提出，让LLM通过特殊token自主决定是否需要检索以及是否使用检索结果。

核心机制：
1. **是否需要检索**：LLM输出 `[Retrieve]` 或 `[No Retrieve]` token
2. **检索结果是否相关**：LLM输出 `[Relevant]` 或 `[Irrelevant]` token
3. **是否支持回答**：LLM输出 `[Fully Supported]` / `[Partially Supported]` / `[Not Supported]`

```python
# Self-RAG逻辑（简化版）
def self_rag(question, retriever, llm):
    # 第1步：判断是否需要检索
    decision = llm.generate(f"问题：{question}\n是否需要查询外部知识？[Retrieve]/[No Retrieve]")
    
    if "[Retrieve]" in decision:
        docs = retriever.retrieve(question)
        
        for doc in docs:
            # 第2步：判断文档相关性
            relevance = llm.generate(f"文档：{doc}\n问题：{question}\n相关？[Relevant]/[Irrelevant]")
            if "[Relevant]" in relevance:
                # 第3步：基于文档生成回答并检查事实验证
                answer = llm.generate(f"基于文档[{doc}]回答：{question}")
                yield answer
    else:
        yield llm.generate(f"回答：{question}")
```

#### 7.2 Corrective RAG（CRAG）

2023年Yan等人提出，核心思想：评估检索质量，对低质量检索进行纠正。

```python
def corrective_rag(question, retriever, llm, web_search):
    docs = retriever.retrieve(question)
    
    # 评估检索质量
    eval_score = llm.evaluate_relevance(question, docs)
    
    if eval_score > 0.8:
        # 高质量检索 - 直接使用
        return generate_answer(question, docs)
    elif eval_score > 0.5:
        # 中等质量 - 提取有用部分 + 补充检索
        useful_parts = extract_relevant(docs, question)
        extra_docs = web_search(question)
        return generate_answer(question, useful_parts + extra_docs)
    else:
        # 低质量 - 完全放弃，使用其他来源
        web_results = web_search(question)
        return generate_answer(question, web_results)
```

#### 7.3 GraphRAG（微软）

2024年微软提出，使用知识图谱增强RAG，特别适合全局性问题和跨实体推理。

**核心流程**：
1. 文档 → 实体抽取（LLM）→ 知识图谱构建
2. 查询 → 实体识别 → 图谱遍历 → 社区摘要
3. 社区摘要 → LLM生成

```python
# GraphRAG概念性流程
def graphrag(query, graph, llm):
    # 1. 从查询中识别实体
    entities = llm.extract_entities(query)
    
    # 2. 在图谱中定位实体并获取邻居
    local_context = graph.get_subgraph(entities, hops=2)
    
    # 3. 生成社区摘要
    community_summaries = graph.summarize_communities(local_context)
    
    # 4. 生成回答
    return llm.generate(f"社区知识：{community_summaries}\n问题：{query}")
```

**GraphRAG vs 传统RAG**：
- 传统RAG：适合"单点"事实查询（"XX公司的创始人是谁"）
- GraphRAG：适合"关系型"和"全局型"查询（"XX公司生态布局的分析"）
- 代价：GraphRAG构建成本高（LLM抽取实体+关系），适合对知识深度要求高的场景

#### 7.4 HyDE（Hypothetical Document Embedding）

2022年由Gao等人提出，核心思路：先用LLM生成一个假设性文档（理想答案），然后用该假设文档的Embedding去检索相似的真实文档。

```python
def hyde(query, llm, embedder, vector_store):
    # 1. 生成假设文档
    hypothetical_doc = llm.generate(
        f"请为以下问题生成一段详细的回答文档：{query}"
    )
    
    # 2. 用假设文档的向量进行检索
    hypo_embedding = embedder.encode(hypothetical_doc)
    real_docs = vector_store.search(hypo_embedding, k=5)
    
    return real_docs
```

**适用场景**：查询与文档的语义差距大时效果好（如"如何做咖啡"检索技术文档）

#### 7.5 2025年Advanced RAG新趋势

| 技术 | 核心思想 | 开源性 |
|------|---------|--------|
| REAPER (2025) | 使用LLM规划多步检索路径 | ✅ |
| RAPTOR (2024) | 递归式文本摘要聚合，构建层级索引 | ✅ |
| Self-Reflection RAG | Agent在生成后自我反思并补充检索 | ✅ |
| Multi-Modal RAG | 图文/视频/音频统一检索 | ✅ |
| FLARE (Active RAG) | 生成过程中主动触发检索 | ✅ |
| CRUD-RAG | 支持增删改查的动态知识库 | ❌ 商业 |

---

### 8. 多模态RAG

#### 8.1 图文检索（Image-Text RAG）

将图像和文本统一到同一向量空间，实现跨模态检索。

```python
# 使用多模态Embedding实现图文RAG
from PIL import Image
from sentence_transformers import SentenceTransformer
import torch

# 使用CLIP或类似多模态模型
model = SentenceTransformer("clip-ViT-B-32")

# 索引图文数据
documents = [
    {"text": "一只猫在晒太阳", "image": Image.open("cat.jpg")},
    {"text": "城市夜景", "image": Image.open("city.jpg")},
]

for doc in documents:
    # 生成图文混合向量
    text_emb = model.encode(doc["text"])
    image_emb = model.encode(doc["image"])
    # 可以根据需要融合或索引两种向量

# 文字检索图片
query = "可爱的动物"
query_emb = model.encode(query)
```

**2025年多模态RAG方案**：
- **图文统一索引**：CLIP/BLIP/Fuyu 生成图文统一向量
- **图生文再检索**：先用VLM描述图片生成文字，再用文字检索
- **交错检索**：同时在文本和图像向量空间中检索

#### 8.2 视频检索

- **基于帧**：关键帧提取 -> 图文RAG
- **基于描述**：视频摘要 -> 文本RAG
- **基于语音**：ASR字幕 -> 文本RAG
- **端到端**：Video-LLM直接处理视频输入（Gemini 1.5 Pro/Claude 3.5支持原生视频理解）

---

### 9. 评估（RAG Evaluation）

#### 9.1 评估框架

| 框架 | 核心指标 | 特点 |
|------|---------|------|
| **RAGAS** | Faithfulness, Answer Relevance, Context Precision, Context Recall | 无需标注数据，LLM as Judge |
| **TruLens** | Answer Relevance, Context Relevance, Groundedness | 基于反馈函数，支持自定义 |
| **DeepEval** | 10+指标，包括Hallucination、Bias、Toxicity | CI/CD集成良好 |
| **ARES** | 使用LLM微调评估器 | 需要少量标注数据 |
| **RGB (RAG Benchmark)** | 标准化评测集 | 学术基准 |

#### 9.2 RAGAS核心指标详解

```python
from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
    answer_correctness,
)

# 评估结果
result = evaluate(
    dataset=eval_dataset,  # question, answer, contexts, ground_truth
    metrics=[
        faithfulness,          # 回答是否基于上下文（无幻觉）
        answer_relevancy,      # 回答是否与问题相关
        context_precision,     # 检索到的上下文是否包含有用信息
        context_recall,        # 需要的所有信息是否都被检索到
        answer_correctness,    # 回答的准确性（需参考答案）
    ]
)
```

**Faithfulness（忠实度）**：最重要的指标，衡量回答是否有幻觉。
- 将回答拆分为独立声明（claims）
- 检查每个声明是否能从上下文中找到依据
- 公式：faithfulness = 可支持的声明数 / 总声明数

**Answer Relevance（答案相关性）**：
- 反向生成问题：根据回答生成N个问题
- 计算生成的问题与原始问题的余弦相似度
- 评估回答是否切题

**Context Precision（上下文精度）**：
- 评估检索结果中相关文档的排序质量
- 相关信息排名越高，分数越高

**Context Recall（上下文召回率）**：
- 参考答案所需的全部信息是否都在检索结果中
- 需要GT（Ground Truth）答案

#### 9.3 评估数据集构建
```python
# 评估数据集格式（RAGAS）
eval_dataset = {
    "question": ["地球到月球的距离是多少？"],
    "answer": ["地球到月球的距离约为38.4万公里。"],
    "contexts": [["月球是地球的卫星，平均距离地球约384,400公里..."]],
    "ground_truth": ["地球到月球的距离约为384,400公里。"]
}
```

#### 9.4 2025年评估趋势
- **LLM as Judge** 成为主流评估方式
- **自一致性评估**：多次采样取均值
- **端到端评估管线**：集成到CI/CD流程
- **成本考量**：评估成本可能超过推理成本，采样评估逐渐被采用

---

## 三、面试常见问题（5个）

### Q1: RAG vs 模型微调（Fine-tuning）如何选型？各自优缺点？

**答**：

**RAG优势**：
1. **知识更新**：只需更新向量库，无需重新训练模型
2. **可解释性**：回答可追溯到具体文档
3. **幻觉控制**：通过检索限制回答范围
4. **成本低**：无需GPU训练资源
5. **长尾知识**：对低频知识效果好

**微调优势**：
1. **风格/行为对齐**：学习输出格式、语气、专业术语
2. **推理能力**：在特定任务上微调可提升推理表现
3. **减少推理成本**：微调后可以用更小的模型达到相同效果
4. **离线场景**：不需要外部检索服务

**选型决策树**：
```
知识更新频率高？→ RAG
需要模型掌握特定输出格式/风格？→ 微调
数据隐私敏感？→ 开源模型微调 + RAG
推理成本敏感？→ 小模型微调
需要精确引用来源？→ RAG
两者不互斥→ RAG + 微调（最佳实践）
```

**2025年趋势**：RAG + 微调混合架构成为主流。用微调让模型学会正确使用检索结果（"如何根据检索内容作答"），用RAG提供实时外部知识。

### Q2: 如何优化检索质量？检索结果不准确或者不相关怎么办？

**答**：

**问题诊断路径**：

1. **Chunking优化**：
   - chunk太大 → 噪声过多，设置300-500 tokens
   - chunk太小 → 上下文不完整，增大chunk并增加overlap
   - 切分边界错误 → 使用Semantic Chunking

2. **Embedding模型优化**：
   - 领域不匹配 → 更换领域专用模型或微调Embedding
   - 多语言问题 → 使用BGE-M3/Jina v3
   - 维度不匹配 → 检查维度和相似度度量

3. **检索策略优化**：
   - 召回不足 → 增加top_k，引入Hybrid Search
   - 精度不足 → 增加Reranker
   - Query模糊 → Query重写（Query Rewrite/Expansion）

4. **Query处理优化**：
```python
# Query Rewrite - 改写用户查询
def rewrite_query(raw_query, llm):
    rewritten = llm.invoke(
        f"将以下用户问题改写为更适合检索的形式，保持原意：{raw_query}"
    )
    return rewritten

# Query Expansion - 扩展查询（多角度检索）
def expand_query(query, llm):
    expansions = llm.invoke(
        f"为以下问题生成3个不同角度的检索查询：{query}"
    )
    return [query] + expansions.split("\n")
```

**系统化优化路线**：
1. 先用BM25 baseline建立下限
2. 嵌入BM25 + Dense Hybrid Search
3. 增加Reranker（Top-100→Top-5）
4. 查漏补缺：分析bad case，针对性优化（query rewrite、HyDE等）

### Q3: 长文档（100页以上）的RAG方案如何设计？

**答**：

长文档RAG面临两个核心挑战：检索精度下降（信息分散在大量文本中）和上下文遗漏（关键信息未检索到）。

**推荐方案**：

1. **分层索引（Hierarchical Indexing）**
```
文档
├── 章节摘要 (embedding)
│   ├── 段落 (embedding)
│   │   └── 句子
│   ├── 段落
│   └── ...
├── 章节摘要
│   └── ...
└── 全局摘要
```

2. **递归检索（Recursive Retrieval）**
   - 第一轮：检索章节摘要，找到相关章节
   - 第二轮：在相关章节中检索具体段落
   - 第三轮：在段落中定位具体内容

3. **RAPTOR（递归摘要聚合，2024）**
   - 底层：原始chunks
   - 中层：chunks聚类+摘要
   - 顶层：摘要的摘要
   - 检索时从多层同时检索

4. **MapReduce策略**
   - 分段总结：将长文档分块，每块独立检索+回答
   - 汇总整合：将各段回答汇总为完整答案

```python
def long_document_rag(large_doc, query, llm, embedder):
    # 方法1：分层检索
    sections = split_by_sections(large_doc)
    section_embeddings = embedder.encode([s.summary for s in sections])
    
    # 先找相关章节
    top_sections = search(section_embeddings, query, k=3)
    
    # 再在章节内精确检索
    results = []
    for section in top_sections:
        chunks = split_into_chunks(section.content)
        results.extend(search(chunks, query, k=2))
    
    return generate_from_chunks(results, query, llm)
```

**2025年长文档方案进阶**：
- 利用长上下文模型（128K-1M tokens）：将整本书直接输入context，配合预处理的文档摘要作为索引
- Agentic RAG：让Agent逐步阅读文档，动态决定下一步检索位置
- KeyBERT + LLM：先用关键词提取定位，再用LLM精读

### Q4: RAG系统中的幻觉问题如何检测和缓解？

**答**：

**检测方法**：

1. **Faithfulness评估（RAGAS）**：自动检测回答是否基于检索内容
2. **Self-Eval（自评估）**：让LLM对自己回答的每个声明进行事实验证
3. **NLI模型**：使用自然语言推理模型判断"上下文是否蕴含回答"
4. **引用标注**：强制LLM在回答中标注来源，无标注部分为潜在幻觉

**缓解策略**：

```python
# 多层幻觉防御
class HallucinationGuard:
    def __init__(self, llm, retriever):
        self.llm = llm
        self.retriever = retriever
    
    def generate_with_guard(self, query):
        # 1. 检索 + 生成
        docs = self.retriever.retrieve(query)
        answer = self.llm.generate(f"基于检索内容回答：{query}\n内容：{docs}")
        
        # 2. 自检测
        verification = self.llm.generate(
            f"回答：{answer}\n检索内容：{docs}\n"
            f"请检查回答中的每个声明是否都能从检索内容中找到依据。"
            f"列出无法支持的声明："
        )
        
        # 3. 如果发现幻觉，重新生成或标记
        if "无法支持" in verification:
            answer = self.regenerate_safe(query, docs)
        
        # 4. 输出时标注可信度
        confidence = self.estimate_confidence(answer, docs)
        return {"answer": answer, "confidence": confidence, "sources": docs}
    
    def regenerate_safe(self, query, docs):
        return self.llm.generate(
            f"基于以下检索内容回答问题，只回答检索内容明确支持的信息。\n"
            f"如果不确定，请回答'根据检索内容无法确定'。\n"
            f"内容：{docs}\n问题：{query}"
        )
```

**系统级方案**：
- **检索质量的提升直接降低幻觉率**
- **设置"不知道"回答策略**：当置信度低时明确拒绝回答
- **引用机制**：强制LLM输出引用（citation），便于人工核实
- **温度调参**：低温度(0-0.3)减少创造性输出

### Q5: 向量数据库选型时，自建方案 vs 托管服务怎么选？

**答**：

**自建方案（FAISS/Milvus/Qdrant自托管）的条件**：
- 有运维团队（Kubernetes、Docker、集群管理）
- 数据隐私/合规要求无法使用SaaS
- 大规模数据（>1亿向量），SaaS成本过高
- 需要深度定制（自定义索引、特殊filter逻辑）

**托管服务（Pinecone/Weaviate Cloud/Qdrant Cloud）的条件**：
- 团队小/无运维能力
- 快速验证产品
- 对SLA有要求（Pinecone 99.99%可用性）
- 中小规模数据（<1亿向量）

**混合策略**：
- 原型阶段：Chroma（本地开发）
- 小规模内测：Pinecone/Qdrant Cloud（快速上线）
- 大规模生产：Milvus/Qdrant自托管（成本优化）

**成本对比**（以1000万向量、768维为例）：
- Pinecone：约$500-1000/月（p2 pod）
- 自建Milvus(3节点)：约$300-500/月（云主机费）
- FAISS纯内存：约$50-100/月（单机RAM）

---

## 四、推荐学习资源

### 论文
- Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks (Lewis et al., 2020) - RAG开山之作
- Self-RAG: Learning to Retrieve, Generate, and Critique (Asai et al., 2023)
- Corrective Retrieval Augmented Generation (Yan et al., 2023)
- GraphRAG: Unlocking LLM Discovery on Narrative Private Data (Microsoft, 2024)
- Precise Zero-Shot Dense Retrieval without Relevance Labels (HyDE, Gao et al., 2022)
- RAPTOR: Recursive Abstractive Processing for Tree-Organized Retrieval (2024)
- RAGAS: Automated Evaluation of Retrieval Augmented Generation (2023)

### 课程与教程
- DeepLearning.AI: Building and Evaluating Advanced RAG
- LangChain: RAG from Scratch (YouTube系列)
- LlamaIndex: RAG Guide (官方文档)
- Pinecone: RAG学习路径

### 工具与框架
- LangChain / LlamaIndex / Haystack - RAG框架
- RAGAS - 评估框架
- TruLens - 评估框架
- Unstructured.io - 文档解析
- Jina AI - Embedding和Reranker

### 开源项目
- llamaindex/examples - LlamaIndex RAG示例
- langchain-ai/rag-from-scratch - LangChain RAG教程
- microsoft/graphrag - 微软GraphRAG
- h2oai/h2ogpt - 开源RAG系统
- oobabooga/text-generation-webui - 本地RAG部署
