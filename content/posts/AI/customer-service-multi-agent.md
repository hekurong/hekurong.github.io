---
title: "从零搭建电商客服多Agent系统：LangGraph + Supervisor 架构实践"
date: 2026-06-02
categories: ["AI"]
tags: ["LangGraph", "LangChain", "MultiAgent", "Agent", "DeepSeek", "记忆系统", "FastAPI"]
series: "多Agent学习"
toc: true
weight: 10
ai_generated: true
---

## 为什么要做这个项目

最近在学习多智能体系统的设计，正好看到 LangGraph 的 Supervisor 模式很适合用来做客服场景——一个主管智能体根据用户意图分发给专业子智能体，最后汇总回复。趁热打铁，用 LangChain + LangGraph + DeepSeek 从零搭了一个电商售前客服系统。

这篇文章会完整介绍系统的架构设计、核心实现和踩坑经验。

## 整体架构

系统采用 **Supervisor + Specialists** 的集中式架构：

```
用户请求 → Supervisor（意图识别）→ Product Agent（商品查询）
                                 → Recommend Agent（推荐导购）
                                 → Promotion Agent（促销查询）
                                 → 汇总回复
```

技术栈：

| 层 | 选型 |
|---|------|
| LLM | DeepSeek（OpenAI 兼容 API） |
| 智能体 | LangChain `create_react_agent` |
| 编排 | LangGraph `StateGraph` + 条件路由 |
| API | FastAPI + Uvicorn |
| 记忆 | SQLite + FTS5 全文搜索 |
| 数据 | JSON 文件（模拟商品/促销库） |

## LangGraph 工作流

工作流是一个 5 节点的 `StateGraph`，共享一个 `AgentState` TypedDict：

```python
class AgentState(TypedDict):
    messages: list[BaseMessage]
    intent: str | None
    phase: int
    session_id: str
    supervisor_reply: str | None
    product_info: str | None
    recommendation: str | None
    promotion_info: str | None
    current_agent: str | None
```

节点流转：

```
START → supervisor_node → [条件路由] → product_node → generate_reply → END
                                       → recommend_node
                                       → promotion_node
                                       → (greeting 直接)
```

### Supervisor 节点

Supervisor 是一个**纯 LLM 节点**，不绑定任何工具。它的职责是分析用户意图并以 JSON 输出：

```python
prompt = """你是一个电商客服主管。请以 JSON 格式输出：
{
    "intent": "product_query",
    "reply": "您好！请问您想了解哪款手机？"
}

intent 类型：product_query | recommend | promotion | greeting
"""
```

LLM 返回的 JSON 被解析后写入 state，`route_by_intent` 条件边根据 `intent` 路由到不同的专业智能体。

### 专业智能体节点

每个专业智能体使用 `create_react_agent` 构建，绑定不同的工具集：

```python
# Product Agent —— 商品查询工具
def create_product_agent(llm, phase, data_service, skill_registry, memory_service):
    tools = skill_registry.get_tools("product", phase)
    tools.append(memory_tools.save_fact)  # 记忆工具所有智能体共享
    tools.append(memory_tools.recall)
    return create_react_agent(llm, tools, state_modifier=PRODUCT_SYSTEM_PROMPT)
```

### Generate Reply 节点

所有专业智能体的输出在此汇聚。优先使用专业智能体的结果，没有则回退到 Supervisor 的问候回复。同时触发**消息窗口压缩**——超过 8 轮对话后，早期消息被 LLM 压缩为摘要注入。

```python
def _compress_messages(state, memory_service):
    if len(state["messages"]) > MAX_TURNS * 2:
        # LLM 生成摘要
        summary = summarize_conversation(state["messages"][:MAX_TURNS * 2])
        # 将摘要作为 SystemMessage 注入
        compressed = [SystemMessage(content=summary)] + state["messages"][MAX_TURNS * 2:]
        # 持久化到长期记忆
        memory_service.save(state["session_id"], "summary", "...", summary)
        return compressed
    return state["messages"]
```

## 分层工具披露：SkillRegistry

一个有意思的设计是**按对话阶段逐步开放工具**。比如在对话初期，商品智能体只能搜索和浏览类目；到了深入咨询阶段，才能查看详情和对比；决策阶段才能查库存。

```python
class SkillLevel(IntEnum):
    INITIAL = 1      # 对话开始：搜索、浏览
    DETAILING = 2    # 深入咨询：详情、对比
    DECISION = 3     # 决策阶段：库存、下单

class SkillRegistry:
    def get_tools(self, skill_name, phase):
        return [t for t, lvl in self._tools[skill_name] if lvl <= phase]
```

这样做的优势：**节省 token**（不让 LLM 看到当前阶段用不到的工具）、**防止越级操作**（比如在对话刚开始时就暴露库存查询）。

阶段推进由 `_try_advance_phase()` 控制：初次对话 → 阶段 1，非问候意图进入阶段 2，消息数 ≥4 进入阶段 3。

## 三层记忆系统

项目实现了**短期→摘要→长期**三层记忆架构：

| 层级 | 存储 | 生命周期 | 用途 |
|------|------|----------|------|
| 短期 | `AgentState.messages` | 单次调用 | 当前对话上下文 |
| 摘要 | LLM 生成 JSON | 压缩注入的 SystemMessage | 超出窗口的对话摘要 |
| 长期 | SQLite + FTS5 | 跨 session 持久 | 用户偏好、历史事实 |

长期记忆的实现很轻量。SQLite 表结构：

```sql
CREATE TABLE memories (
    id INTEGER PRIMARY KEY,
    session_id TEXT,
    type TEXT,       -- preference | summary | product_interaction | fact
    key TEXT,
    value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE VIRTUAL TABLE memories_fts USING fts5(key, value, content=memories, content_rowid=id);
```

FTS5 全文搜索让 `recall` 工具能快速检索历史记忆，无需引入向量数据库。三个触发器自动保持 FTS 索引同步。

Agent 通过两个 `@tool` 函数访问记忆：

```python
@tool
def save_fact(key: str, value: str) -> str:
    """保存一条关于用户的事实信息或偏好。"""
    memory_service.save("global", "fact", key, value)
    return f"好的，已记住：{key} = {value}"

@tool
def recall(query: str) -> str:
    """搜索关于用户的历史记忆。"""
    results = memory_service.search(query)
    return format_recall_results(results)
```

## 工具集一览

系统共有 10 个工具，按专业领域分布：

| 专业 | 阶段 | 工具 | 作用 |
|------|------|------|------|
| Product | 1 | `search_products(keyword)` | 关键词搜索商品 |
| Product | 1 | `get_category_list()` | 获取商品类目 |
| Product | 2 | `get_product_detail(id)` | 查看商品详情 |
| Product | 2 | `compare_products(ids)` | 对比商品 |
| Product | 3 | `check_stock(id, qty)` | 查库存 |
| Recommend | 1 | `get_all_categories()` | 浏览类目 |
| Recommend | 1 | `get_products_by_category(c)` | 按类目推荐 |
| Promotion | 1 | `get_active_promotions()` | 查看促销 |
| Promotion | 2 | `check_product_promotion(id)` | 查商品促销 |

外加两个记忆工具（`save_fact` / `recall`），所有智能体共享。

## API 层

FastAPI 提供两个端点，简单直接：

```python
class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None  # None 时自动创建新 session

class ChatResponse(BaseModel):
    reply: str
    session_id: str

@router.post("/chat")
async def chat(req: ChatRequest):
    session_id = req.session_id or str(uuid.uuid4())
    phase = phase_manager.get_phase(session_id)
    result = await graph.ainvoke({"messages": messages, "session_id": session_id, "phase": phase})
    reply = result["messages"][-1].content
    return ChatResponse(reply=reply, session_id=session_id)
```

前端是一个纯 HTML/CSS/JS 聊天界面，支持多 session 切换。前端直接 fetch `/api/chat`，没有构建工具。

## 踩坑与反思

**1. Supervisor JSON 解析的鲁棒性。** 即使提示词要求"不要包含 markdown 代码块"，LLM 有时还是会输出 ` ```json ... ``` `。用正则 `re.search(r'\{.*\}', text, re.DOTALL)` 兜底，再加一个关键词匹配的 fallback，基本不会挂。

**2. 消息窗口管理要在统一的节点做。** 最初消息压缩分散在各个智能体节点中，导致 state 不一致。统一在 `generate_reply_node` 中处理后，逻辑清晰很多。

**3. FTS5 触发器比应用层管理更可靠。** 早期记忆索引是在 Python 代码里手动维护的，经常出现数据不一致。改用 SQLite 触发器后，FTS 索引自动跟随主表变更，零维护。

**4. `create_react_agent` 比手写循环好太多。** v1 是自己手写 Agent 循环的（while 循环 + LLM 调用 + 工具执行），代码冗长且容易出 bug。v2 切换到 LangChain 的 `create_react_agent`，Agent 节点变成一行代码：

```python
agent = create_react_agent(llm, tools, state_modifier=PROMPT)
result = agent.invoke({"messages": state["messages"]})
```

本质上就是把思考和工具调用交给了框架，把精力集中在业务逻辑上。

## 总结

这个项目的核心价值不是"做出了一个客服系统"，而是跑通了以下几个模式：

1. **Supervisor + Specialists** 多智能体编排——用 LangGraph StateGraph 做条件路由
2. **分层工具披露**——根据对话阶段逐步开放工具能力
3. **三层记忆**——短期 state + LLM 摘要 + SQLite FTS5 长期持久化
4. **模块注入**——不用 DI 框架，通过模块级全局变量注入 DataService 等单例

完整代码在 [GitHub](https://github.com/KurongTohsaka/CustomerService-MultiAgent) 上，可以直接 clone 运行（配好 DeepSeek API Key 即可）。

后续计划加入 `check_tool_call` 人工审批节点，让敏感操作（如下单）必须经过确认，算是多 Agent 系统的进阶玩法。
