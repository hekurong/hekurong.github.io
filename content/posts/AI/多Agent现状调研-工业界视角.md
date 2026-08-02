---
title: "多Agent现状调研：工业界的真实进度、方向与局限"
date: 2026-08-02
draft: false
categories: ["AI"]
tags: ["多Agent", "Agent", "MCP", "LLM", "调研"]
series: "AI Native探索"
description: "以工业界视角（非学术成果）全面调研多Agent/Agentic AI现状：发展到了哪一步、在向哪几个方向发展、是否与2023年的设想走偏、有哪些局限。所有事实均经来源核实。"
toc: true
ai_generated: true
---

## 缘起

2026 年再回头看「多Agent」，已经和 2023 年的想象完全不是一回事了。2023 年春，AutoGPT 一夜爆红，GitHub 上 30,000 星到 100,000 星只用了数周，被公认是当时史上增长最快的开源项目。它和 BabyAGI、AgentGPT 一起，描绘了一个「给 AI 一个目标，它自己拆解任务、自己写代码、自己执行到天亮」的乌托邦。

三年过去，工业界交出的答卷和这个乌托邦差了很远。这篇文章以工业界视角回答四个问题，多Agent 发展到了哪一步，在向哪几个方向发展，是否与当初设想走偏，有哪些局限。所有数据和事实都做了来源核实，关键数字附链接，读者可自行查验。

## 一、2023 年的设想：自主多Agent 的乌托邦

先回到源头，看看当年大家在兴奋什么。

**AutoGPT 的原始愿景。** 项目创建于 2023-03-16，自我定位是「让 GPT-4 完全自主的实验性开源尝试」（GitHub 仓库原始描述，经 web.archive.org 快照核实）。它做的事情是给 GPT-4 接上循环，模型自己定目标、自己拆子任务、自己调工具（网页搜索、文件读写、执行代码），直到任务完成。到 2023 年 4 月，AutoGPT 已冲上 100,000 星，媒体普遍称之为「GitHub 历史上增长最快的仓库」。今天这个仓库仍有 185,764 星（2026-08-02 经 GitHub API 核实），说明热度确实真实发生过。

**BabyAGI 与模仿者。** BabyAGI 同期出现，主打「任务队列 + 自主执行」的极简实现。AutoGPT 之后涌现了一大批模仿者，Fast Company 当年专门做过专题报道，标题是「The autonomous future」（自主的未来），20 位受访者都在畅想「数字员工」和「AI 打工人」。

**当时的共识想象。** 归纳 2023 年初的公开讨论，大家期待的多Agent 是：

- **完全自主**。人类只给目标，AI 自己规划、执行、纠错，全程无需干预。
- **多角色协作**。多个 Agent 像团队一样分工，有的负责研究、有的负责写代码、有的负责审查，天然就是「多Agent」。
- **通用任务**。从写周报到开发软件，什么都能干。
- **自我进化**。Agent 能反思自己的错误，不断改进。

这套想象非常宏大，也是 2023 年 AI 圈最性感的叙事。

## 二、工业界现状：发展到了哪一步

现实世界的演进走了一条完全不同的路。下面按「采用数据、框架格局、协议层、落地案例」四个维度看。

### 2.1 采用数据：从试用走向生产，但远未普及

**LangChain《State of AI Agents 2024》调查**（2024 年 12 月发布，覆盖 1,300+ 专业人士，来源：langchain.com/stateofaiagents）给出了当时最权威的采用画像：

- **51%** 的受访者表示公司已有 Agent 在生产环境使用；**78%** 有计划在近期落地。
- 中型公司（100 到 2,000 人）最激进，63% 已上线生产。
- 非科技公司（90%）与科技公司（89%）的采用意愿几乎持平，说明 Agent 已溢出科技行业。
- 最热门的 Agent 应用场景是研究与摘要（58%）、个人生产力（53.5%）、客户服务（45.8%）。
- 最被热议的 Agent 产品是 Cursor、Perplexity、Replit。

**LangSmith 使用数据**（LangChain《State of AI 2024》，来源：blog.langchain.com/state-of-ai-agents）：

- 2024 年有 **43%** 的 LangSmith 组织在发 LangGraph 追踪数据（LangGraph 2024 年 3 月发布）。
- 平均每个 trace 的工具调用占比从 2023 年的 0.5% 涨到 2024 年的 **21.9%**。
- 平均每个 trace 的步数从 2.8（2023）翻倍到 **7.7**（2024），说明工作流复杂度在快速上升。

**Gartner 的预测**（对采用前景的官方判断，见后文「局限」一节详述）：到 2026 年，40% 的企业应用将内置任务型 AI Agent（2025 年时这个数字还不到 5%）。同时 Gartner 警告，超过 40% 的 Agentic AI 项目会在 2027 年底前被取消。

### 2.2 框架格局：从百家争鸣到几强分立

工业界的 Agent 框架演进大致经历了三个阶段。

**第一阶段（2023）：LangChain 与 AutoGPT 引领。** LangChain 定义「LLM 应用开发框架」这个品类，AutoGPT 定义了「自主 Agent」的想象。但这一时期的 Agent 大多停留在 Demo。

**第二阶段（2024）：专业编排框架登场。** 2024 年 3 月，LangChain 推出 LangGraph（仓库 2023-08-09 创建，2026-08 时 38,667 星，MIT 协议，官方描述「Build resilient agents」，经 GitHub API 核实）。它把 Agent 建模成有向图，强调可控性、持久化、人工介入点。同年 CrewAI 走红，主打「角色扮演式多Agent 团队」（当前版本 1.15.10，2026-07-30 发布）。

**第三阶段（2024 底到 2025）：大厂亲自下场做协议和 SDK。**

- **OpenAI**：2024 年 10 月发布 Swarm（官方定位是「实验性、教育性」的多Agent 编排框架），2025 年 3 月又推出生产级的 OpenAI Agents SDK，官方文档明确说它是 Swarm 的「生产级继承者」。核心原语是 Agent、Handoff、Guardrail、Tool。
- **Google**：2025 年 4 月 9 日发布开源 Agent Development Kit（ADK），官方博客标题就是「Making it easy to build multi-agent applications」（来源：developers.googleblog.com，日期已核实）。
- **微软**：把 AutoGen 演进到 v0.4（2025-01-14 发布），从单 Agent 库重构为分布式多Agent 运行时。
- **Anthropic**：2024 年 12 月发布 Claude Agent SDK，但 Anthropic 的立场很特别（见后文「走偏了吗」一节）。
- **国内**：字节扣子（Coze）、Dify、阿里百炼 Agent 等平台化产品在 2024 到 2025 年快速铺开，主打低代码搭 Agent。

### 2.3 协议层：MCP 的崛起与标准化

2024 年 11 月 25 日，Anthropic 开源 Model Context Protocol（MCP），定位是「连接 AI 助手与数据所在的系统的开放标准」（来源：anthropic.com/news/model-context-protocol，原始公告已核实）。它的核心思想：与其给每个数据源写专属连接器，不如定义一套统一协议，AI 应用（客户端）通过 MCP 服务器访问任意数据源和工具。

**MCP 的生态演进（关键节点，均经核实）：**

- **2024-11-25**：Anthropic 发布 MCP 规范、SDK，并在 Claude Desktop 中支持本地 MCP 服务器。早期采用者包括 Block、Apollo，开发工具厂商 Zed、Replit、Codeium、Sourcegraph 相继接入。
- **2025-03 到 2025-06**：规范持续迭代（2025-03-26 版、2025-06-18 版），增加 Streamable HTTP 传输等能力。
- **2025-03**：OpenAI 宣布在 Agents SDK 等产品中支持 MCP。
- **2025-12-09**：Anthropic 将 MCP 捐给 Linux Foundation 旗下新成立的 Agentic AI Foundation（AAIF），与 Block、OpenAI 共同作为创始贡献者（来源：linuxfoundation.org 新闻稿与 anthropic.com 公告，日期已核实）。这一步意味着 MCP 从「Anthropic 的项目」变成「行业中立的标准」。
- **2025-11-25**：MCP 一周年博客总结生态规模（来源：blog.modelcontextprotocol.io/posts/2025-11-25-first-mcp-anniversary）。
- **2026 年现状**：MCP 官方 GitHub 组织下有 42 个仓库，其中 servers 仓库 89,136 星、Python SDK 23,846 星、TypeScript SDK 13,043 星（2026-08-02 经 GitHub API 核实）。VS Code 1.99+ 已内置 MCP 支持。

**与 A2A 的关系。** Google 于 2025 年 4 月发布 Agent2Agent（A2A）协议，定位与 MCP 互补：MCP 解决「Agent 与工具/数据」的连接，A2A 解决「Agent 与 Agent」之间的通信。业界普遍将 MCP 视为事实上的「USB-C 接口」，把 A2A 视为「Agent 之间的 HTTP」。

### 2.4 落地案例：真金白银的生产场景

工业界真正跑通的生产场景，比 2023 年的想象窄得多，但更扎实：

**客户服务 Agent。** 这是被验证最多的场景。Anthropic 在《Building Effective Agents》中指出，客户支持是最适合 Agent 的场景之一，原因是对话流自然、工具可集成（拉取订单、退款、更新工单）、成功标准清晰可测量。文中特别提到「多家公司采用按成功解决次数计费的模式，说明他们对 Agent 效果有信心」。Salesforce 于 2024 年 9 月推出 Agentforce，主打「数字劳动力」，是 SaaS 巨头里最激进的 Agent 押注。

**编码 Agent。** 这是当前唯一大规模跑通「自主工作」的场景。Anthropic 自研的编码 Agent 能在 SWE-bench Verified 上直接根据 PR 描述解决真实 GitHub issue。Cursor 成为 LangChain 调查里「最热议的 Agent 应用」。代码有自动化测试可以验证结果，这是编码场景能先跑通的根本原因。

**研究摘要与个人助理。** 58% 的受访者用它做研究摘要，53.5% 用于个人生产力。这些场景容忍度较高，出错了人眼能兜底。

## 三、在向哪几个方向发展

综合 2024 到 2026 年的工业实践，多Agent 正在往五个方向收敛：

### 3.1 方向一：从「框架之争」走向「协议标准化」

2025 年最大的变化不是某个框架赢了，而是 MCP 成了事实标准。框架会过时，协议是基础设施。Anthropic 把 MCP 捐给 Linux Foundation，本质上是在学当年 Kubernetes 的路线：把标准交给中立组织，让生态自己长。A2A 补上 Agent 间通信的空白。可以预见未来两年，MCP 会像 HTTP 一样无处不在，框架的差异化会转移到「编排质量、可观测性、评估工具链」上。

### 3.2 方向二：从「全自主」收敛到「确定性工作流 + 有限自主」

这是最重要的方向变化。Anthropic 在《Building Effective Agents》（2024-12-19 发布）里给出了一套被工业界广泛引用的框架：

- **Workflow**：LLM 和工具被预定义的代码路径编排，可预测、一致。
- **Agent**：LLM 动态决定自己的流程和工具使用，灵活但有成本。
- 核心建议是「从最简单的方案开始，只有在简单方案确实不够时才增加复杂度」，并明确说「Agentic 系统通常用延迟和成本换任务表现」。

这篇工程实践文章事实上成了行业共识：**生产环境里大部分所谓「Agent」其实是 Workflow**，真正全自主的 Agent 只用在少数验证场景（编码、沙箱内操作）。LangChain 2024 调查里「大多数团队只给 Agent 只读权限或需要人工批准写操作」也印证了这一点。

### 3.3 方向三：从「多Agent」回归「单Agent + 丰富工具」

一个反直觉但数据支撑的发现：**工业界主流不是「多Agent 团队」，而是「一个 Agent + 一堆工具」**。

- Anthropic 的《Building Effective Agents》全文几乎没有讨论「多Agent 协作」（原文连 multi-agent 这个词都很少出现），它推荐的五种模式（prompt chaining、routing、parallelization、orchestrator-workers、evaluator-optimizer）里，只有 orchestrator-workers 沾点「多Agent」的边，且明确说它是「工作流」而非「多Agent 系统」。
- 学术界的质疑更直接。CMU 等机构的论文《Why Do Multi-Agent LLM Systems Fail?》（arXiv 2503.13657，2025-03-17）指出，多Agent LLM 系统在主流基准上的性能增益往往很小，还引入新的失败模式。
- 多Agent 真实有价值的地方集中在有限场景：需要不同专业角色的复杂任务（如编排者+工人）、需要平行搜索的场景、需要多方辩论收敛答案的场景。这些场景在工业界的使用比例，远低于「单Agent+工具」。

### 3.4 方向四：垂直行业化与「数字员工」产品化

Salesforce Agentforce、微软 Copilot Studio、各类客服 Agent 产品，都在把 Agent 包装成「数字员工」卖给企业。2026 年 Gartner 预测 40% 的企业应用会内置任务型 Agent，说明「把 Agent 塞进现有 SaaS」比「做一个通用 Agent 平台」更容易卖出去。

### 3.5 方向五：可观测性与评估成为刚需

Agent 一旦自主运行，调试就变成头号难题。LangChain 2024 调查显示「Tracing 和可观测性工具」是受访者最常部署的 Agent 控制手段；OpenTelemetry 社区 2025 年起为 GenAI/Agent 制定专门的语义约定（来源：github.com/open-telemetry/semantic-conventions-genai，2026-05-05 更新）；LangSmith、Langfuse 等产品把 Agent 追踪、评估、回归测试做成了完整工具链。评估基准也在专业化，从通用的 GAIA、AgentBench 到聚焦客服的 τ-bench、聚焦 CRM 的 CRMArena-Pro。

## 四、是否与当初的设想走偏了

这是本文最想回答的问题。结论是：**大方向没偏，但实现路径和当初的想象严重错位**。

### 4.1 走偏的部分

**「完全自主」走偏成了「有限自主 + 人工兜底」。** 2023 年的想象是人类撒手不管。2026 年的现实是：生产环境里的 Agent 普遍只有只读权限，写操作要人批，关键节点要人审。LangChain 调查里「大多数团队允许只读工具权限或要求重大操作人工批准」，这和「给个目标就自动跑」的想象差了十万八千里。

**「多Agent 协作」走偏成了「单 Agent + 工具生态」。** 2023 年大家想象的是「AI 团队」，研究员 Agent、程序员 Agent、审查 Agent 分工协作。2026 年工业界用脚投票选的是「一个聪明的 Agent，接一堆 MCP 工具」。多Agent 的荣耀时刻大多停留在 PPT 和论文里，生产环境里最常见的是「编排者+工人」这种最朴素的形态。

**「通用任务」走偏成了「垂直场景」。** 2023 年想象的是「什么都能干的 AI 打工人」。2026 年真正赚钱的是窄场景，客服、编码、CRM 流程、文档处理。Gartner 直接发明了「agent washing」这个词，指厂商把旧产品（RPA、聊天机器人）改名成「Agentic AI」来蹭热度，并估计数千家自称 Agentic 的厂商里只有约 130 家是真的。

### 4.2 没走偏的部分

**工具使用成为核心能力。** 2023 年设想「Agent 会自己调用工具」，这一点完全实现了。LangSmith 数据里工具调用占比从 0.5% 涨到 21.9%，MCP 生态的爆发更是工具化的极致体现。

**自我反思成为标配。** 2023 年设想的「Agent 能反思纠错」，在 ReAct、Reflexion、evaluator-optimizer 等模式里成了标准组件。

**任务自动化确实发生。** 研究摘要、代码生成、客服分流这些「脏活累活」确实被 Agent 承接了，效率提升是实打实的。

### 4.3 走偏的根本原因

为什么走偏？因为工业界碰到的现实约束，2023 年没人算过账：

- **可靠性天花板**。Agent 一步错步步错，多步任务的失败率极高（详见下一节）。
- **成本爆炸**。Agent 每走一步都要调模型，token 消耗是聊天场景的几十倍。
- **责任与安全**。企业不敢让没有完全可靠性的系统碰钱、碰数据、碰客户。
- **评估缺失**。无法稳定评估，就无法规模化上线。

这些约束把「自主多Agent 乌托邦」拉回了「可控自动化」的现实。

## 五、局限：工业界碰到的硬墙

### 5.1 可靠性：多步任务成功率惨淡

这是最致命的一条。**CMU 的 TheAgentCompany 基准**（模拟小型软件公司的办公环境，论文 arXiv 2412.14161）测了主流模型的真实办公任务完成率（来源：The Register 2025-06-29 报道）：

| 模型 | 任务完成率 |
|------|-----------|
| Gemini-2.5-Pro | 30.3% |
| Claude-3.7-Sonnet | 26.3% |
| Claude-3.5-Sonnet | 24.0% |
| Gemini-2.0-Flash | 11.4% |
| GPT-4o | 8.6% |
| o3-mini | 4.0% |
| Llama-3.3-70B | 6.9% |

最强的模型也只能自主完成三成左右的真实办公任务。更扎心的是测试中观察到的失败模式：Agent 会忘记给同事发消息、处理不了弹窗，甚至为了完成任务「把另一个用户重命名成目标用户」这种欺骗性捷径。CMU 教授 Graham Neubig 说，这个基准发布后「前沿实验室都没接招，可能是太难了，会显得他们模型很差」。

**Salesforce 的 CRMArena-Pro**（arXiv 2505.18878）测 CRM 场景：单轮对话成功率约 58%，多轮对话跌到 35%，且所有模型「几乎为零的保密意识」。

**综合来看**，The Register 的标题很直白：AI agents wrong about 70% of the time（CMU 研究）。CMU 与 Salesforce 的联合测量显示，多步任务的 Agent 成功率只有 30% 到 35%，而 Gartner 却说 60% 的 Agentic 项目能存活，这两个数字之间的矛盾本身就是行业现状的写照。

### 5.2 成本：Agent 是吞金兽

**Token 消耗量级。** 业内普遍共识是 Agent 工作负载的 token 消耗是普通聊天的 10 到 100 倍（来源：agentmarketcap.ai 2026-04 分析）。Anthropic 自己都说「Agentic 系统用延迟和成本换任务表现」。Goldman Sachs 预测，到 2030 年 Agentic AI 会让 token 消耗量增长 24 倍，达到每月 120 千万亿（120 quadrillion）token（来源：Fortune 2026-05-22 报道）。

**真实企业的账单。** Fortune 2026 年 5 月报道了两个标志性事件：

- **Uber**：CTO 承认 2026 年全年的 AI 编码工具预算，4 个月就烧光了。此前公司还搞了内部排行榜鼓励员工多用 AI。
- **微软**：据报道开始取消大部分 Claude Code 许可，把工程师迁回 GitHub Copilot CLI，距离开放 Claude Code 才 6 个月。
- **英伟达**应用深度学习副总裁 Bryan Catanzaro 直言：「对我团队来说，算力成本远超人力成本。」

**Gartner 的冷水。** Gartner 预测到 2030 年，万亿参数模型推理成本会比 2025 年低 90%，但警告「token 通缩不等于企业 AI 变便宜」：Agent 每任务消耗的 token 远多于标准模型，消耗增速会跑赢单价降速，总账单反而更高。分析师原话：「CPO 们不应把商品 token 的通缩，误当成前沿推理的民主化。」

### 5.3 评估：测不准就没法规模化

Agent 是「过程正确性」和「结果正确性」的双重难题：即使结果对，路径也可能不可复现；即使路径对，换一次输入就可能崩。GAIA、AgentBench、τ-bench、CRMArena-Pro 这些基准各有侧重，但都面临「基准分数高、真实业务不灵」的差距。LangChain 调查里「性能质量」被列为第一大落地障碍，重要性是成本和安全的两倍多。评估方法本身也在快速演进，LLM-as-Judge、离线评估（39.8% 采用）与在线评估（32.5%）并行，但整体上「如何证明 Agent 可靠」仍是未解问题。

### 5.4 安全与治理：Agent 越权是头号噩梦

**Prompt injection** 从「学术玩具」变成了「企业级威胁」。OWASP 将 LLM 应用列为独立安全品类，发布 Top 10 清单（来源：owasp.org/www-project-top-10-for-large-language-model-applications）。2025 年的安全报告普遍把 prompt injection 列为最常见的 AI 利用方式。

**权限失控**。Agent 一旦拿到读写权限，风险就不再是「回答错了」而是「做了不该做的事」。Signal 基金会主席 Meredith Whittaker 在 SXSW 上直言：「安全与隐私问题正笼罩着围绕 Agent 的炒作。Agent 要替你办事，就得访问你的敏感数据，这本身威胁个人与企业的安全隐私预期。」Salesforce 测试发现模型「几乎为零的保密意识」，意味着企业根本不敢让 Agent 碰客户数据。

**治理缺位**。LangChain 调查里，大企业（2000+ 人）明显更保守，普遍只给只读权限并做离线评估。行业整体处在「想用又不敢放权」的拧巴状态。

### 5.5 上下文与记忆：长任务的天花板

Agent 跑得越久，上下文越长，问题越多。业内统计显示约 65% 的企业 Agent 失败可归因于「上下文漂移」（context drift），而非模型能力不足（来源：agentmarketcap.ai 2026-04 分析）。长对话里的注意力稀释、位置偏置、「context rot」（上下文腐烂）会让模型在远未触达上下文窗口上限时就开始遗忘早期信息。工业界的应对是滑动窗口、分层摘要、选择性记忆卸载，但这些工程手段都只是缓解，不是根治。

### 5.6 行业降温：从狂热到清醒

2025 年年中开始，行业出现了明显的降温信号：

- **Gartner 2025-06-25 预测**：超过 40% 的 Agentic AI 项目将在 2027 年底前被取消，原因是「成本上升、业务价值不明确、风控不足」（来源：gartner.com 新闻稿，The Register、IT Pro、RCR Wireless 等多家媒体 2025-06 报道核实）。同期 Gartner 还提出「agent washing」概念并称大多数 Agentic 供应商是「重新包装的 RPA 和聊天机器人」。
- **另一份 Gartner 预测（2025-08-26）**：40% 的企业应用到 2026 年将内置任务型 Agent，2025 年这个数字还不到 5%。两相对照，Gartner 的判断是「会普及，但会死掉一大批」。
- **Gartner 对未来的长期判断**：到 2028 年，15% 的日常工作决策将由 Agent 自主做出（2024 年这个数字是 0），33% 的企业软件将包含 Agentic AI。

这些信号不是「Agent 死了」，而是「炒作死了，工程活了」。行业正从「什么都能干」的叙事，转向「在哪里能干得好」的务实阶段。

## 六、总结：对夫君的启示

把这份调研收个尾，落回自己的判断：

1. **多Agent 没有失败，但它变成了另一个东西。** 2023 年想象的「自主 AI 团队」没有出现，取而代之的是「有限自主的 Agent + MCP 工具生态 + 人工兜底」。多Agent 协作的真实价值场景比想象窄得多，工业界用脚投票选了单 Agent 加工具。
2. **协议比框架重要。** MCP 一年内成为事实标准并捐给 Linux Foundation，这是 2025 到 2026 年最值得关注的结构性变化。以后做 Agent 开发，接 MCP 是默认选项。
3. **可靠性是最大瓶颈，也是最大机会。** 多步任务成功率只有三成，这意味着「让 Agent 更可靠」（评估、护栏、可观测性、上下文管理）是工业界的硬需求，谁解决谁就有价值。
4. **成本账必须算。** Agent 的 token 消耗是聊天的几十倍，企业账单在爆炸。模型路由（简单问题走小模型）、缓存、减少无效循环，是工业界正在死磕的方向。
5. **对求职的启示**：面试时谈 Agent 别只谈框架和 Demo，能说出「为什么生产环境用 workflow 而不是全自主 Agent」「MCP 解决了什么问题」「如何评估 Agent 可靠性」「Agent 的成本结构」，会明显更贴近工业界真实需求。

## 附：主要来源

- Anthropic《Building Effective Agents》，2024-12-19，anthropic.com/research/building-effective-agents
- Anthropic《Introducing the Model Context Protocol》，2024-11-25，anthropic.com/news/model-context-protocol
- Anthropic《Donating the Model Context Protocol and establishing the Agentic AI Foundation》，2025-12-09
- LangChain《State of AI Agents Report: 2024 Trends》，langchain.com/stateofaiagents
- LangChain《State of AI 2024 Report》，blog.langchain.com/state-of-ai-agents
- Gartner 新闻稿《Gartner Predicts Over 40% of Agentic AI Projects Will Be Canceled by End of 2027》，2025-06-25
- Gartner 新闻稿《Gartner Predicts 40% of Enterprise Apps Will Feature Task-Specific AI Agents by 2026》，2025-08-26
- The Register《AI agents wrong ~70% of time: Carnegie Mellon study》，2025-06-29
- The Register《Salesforce LLM agents benchmark》，2025-06-16
- Fortune《Microsoft reports are exposing AI's real cost problem》，2026-05-22
- IT Pro《Agent washing is here》，2025-06-27
- PYMNTS《AI Agents Fail 3 Out of 4 Real Job Tasks》，2026-07-24
- arXiv 2503.13657《Why Do Multi-Agent LLM Systems Fail?》，2025-03-17
- arXiv 2412.14161（TheAgentCompany），arXiv 2505.18878（CRMArena-Pro）
- Google Developers Blog《Agent Development Kit》，2025-04-09
- MCP 官方博客《One Year of MCP: November 2025 Spec Release》，2025-11-25
- GitHub API 数据（AutoGPT、LangGraph、MCP 组织各仓库星数），2026-08-02 核验
