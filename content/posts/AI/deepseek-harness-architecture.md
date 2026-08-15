---
title: "DeepSeek Harness 架构全解读：两天十万星的一切皆插件"
date: 2026-08-15
draft: false
categories: ["AI"]
tags: ["DeepSeek", "Agent", "Harness", "Cordis"]
description: "DeepSeek 官方 agent harness（dsh）架构深度解读。无特权内核、事件溯源会话、能力 Seam、Scope 作用域、Subagent 与 Ralph、持久化与崩溃恢复，逐层拆解两天十万星的设计。"
toc: true
ai_generated: true
---

2026 年 8 月 13 日，DeepSeek 开源了官方 agent harness，命令行工具叫 `dsh`。两天不到，star 数突破十万，成为 agent 圈当下最热的一把火。

它为什么火？不只是光环效应。仓库里有真东西，一个把「一切皆插件」贯彻到极致的设计，一份工程密度极高的 monorepo，一套严谨得罕见的架构文档。

这篇文章基于官方仓库的 README、架构文档、子系统文档、事件矩阵与源码结构，逐层拆解 dsh 的设计。

## 项目档案

| 项 | 值 |
|---|---|
| 仓库 | github.com/deepseek-ai/deepseek-harness |
| 口号 | Everything is a Plugin |
| 语言 | TypeScript monorepo |
| 协议 | MIT |
| 版本 | 0.1.0-rc.5，开发者预览 |
| 运行要求 | Node ^22.19.0 或 >=24.0.0，pnpm 11.7 |
| 文件体量 | 约 8600 个文件，219 个 npm 包，2 个应用（cli、web） |
| 数据 | 10.9 万 star、1.05 万 fork（8 月 15 日） |
| 状态 | developer preview，官方明示将出现破坏兼容性的变更 |

## 内核：Cordis 与无特权架构

dsh 没有自研 agent 内核，而是 vendor 引入了一个插件框架 Cordis（cordiverse/cordis），配套论文《A Programming Paradigm for Spatiotemporal Composability》。

Cordis 给 dsh 带来五个核心概念。

- 插件是实现服务的对象，可以是一个带 inject 和 apply(ctx) 的函数，也可以是一个 Service 子类
- 上下文是服务的容器，每个服务占据一个稳定的 `ctx.<key>`，例如 ctx.tools、ctx.llm、ctx.sessions
- 插件通过 inject 声明服务依赖，加载顺序由依赖关系决定，而非手动编排启动序列
- 类型化事件用于通信，四种分发模式
- 注册是可逆副作用，reload 与 teardown 时自动撤销

四种事件分发模式：

| 模式 | 语义 |
|---|---|
| emit | 监听器按注册顺序观察，不等待 |
| waterfall | 环绕中间件，可包装、可短路 |
| parallel | 所有监听器并行处理 |
| serial | 按注册顺序执行并返回 |

waterfall 是这套系统的灵魂。监听器收到 `(...args, next)`，调用 next() 委托下游，不调用则短路。策略插件由此可以插在模型与工具之间，无需 fork 内核。协作式监听器通常修改共享的请求对象然后委托，拥有决策权的策略监听器可以直接返回结果短路。

## Profile 与组合包

运行中的 dsh 是一棵插件树，由启动时按序叠加的各层组合而成。

- profile 是存放在 Harness home 中的具名组装，列出自己叠放的组合包，保存用户自己的 cordis.patch.yml。web 与 headless 作为模板随发行版交付
- 组合包是 Cordis 配置及其挂载代码的分发格式，插入的内容始终可被上层 patch
- dsh-base 是每个 profile 的第一层，模型适配器、工具、持久化、沙箱、审批策略、设置、凭据、遥测都在其中；dsh-web-app 增加浏览器应用；dsh-headless 增加一次性运行器，不带服务器

各层按序应用在空条目列表上。先是 profile 列出的组合包顺序，然后是 profile 的 cordis.patch.yml，再是 home 级的 patch，最后是任意 `--patch` overlay。一条 patch 按 id 定位某个条目并替换其整个 config，或插入新条目。

想看机器上实际启动的配置树，跑 `dsh --profile web --dump-config`。它打印出的任何条目，都可以由自己的 patch 替换。

## 主干六包：事件溯源的会话

一个轮次按同一条循环流经六个包。

| 包 | 职责 |
|---|---|
| session | 仅追加的 SessionEvent 日志与内存 store，唯一真源 |
| system-prompt | 提示词片段与工具 schema 组装 |
| tools | 带作用域的工具注册表与受保护的执行流水线 |
| agent | Agent 接口、活跃 agent 注册表、agent/* 事件 |
| agent-loop | 实现该接口的默认驱动器 |
| scope | 按 agent 划分作用域的注册原语 |

最值得注意的设计是会话模型。会话不是消息列表，而是一份仅追加的事件日志。模型看到的消息历史从不单独存储，而是从日志派生。回放、fork、恢复、transcript、遥测、持久化，全部派生自同一事件流。

## 轮次与步骤

一个步骤是一次模型请求加上它调用的工具。一个轮次包含零个或多个步骤，在领取首条输入时打开，在不再欠下任何工作时关闭。

轮次流程的核心节点如下。

- `turn/start` 打开轮次，认领排队的输入
- `agent/pre-step` 是瀑布事件，决定模型看到什么，可以改写消息，也可以直接拒绝
- `system-prompt/assemble` 组装提示词片段与工具 schema
- `agent/request` 与 `llm/stream` 发起模型请求，`assistant/chunk` 逐 token 落日志
- `tool/call` 与 `tools/pre-execute`、`tools/execute`、`tools/post-execute` 分发工具调用
- `step/end` 关闭步骤
- `agent/turn-stopping` 是轮次末的串行检查点
- `turn/end` 关闭轮次

被拒绝的步骤不会产生模型请求，但会留下一个不含步骤的持久轮次，因此日志会记录这次尝试。输入通过同一个 inbox 到达驱动器，有些消息会立即唤醒它，注入的上下文则留在 inbox 中，等另一条消息唤醒。

## 模型可见即已记录

这是 dsh 最硬的一条运行时不变量：抵达模型请求的一切都必须能从日志重建，并由运行时不变式断言。因此，新增一项模型可见输入就需要新增一个会话事件，扩展 SessionEventMap 并从日志渲染。

这条不变量把可观测性从「事后补救」提升为「结构约束」。任何插件都不可能让模型看到日志里没有的东西，transcript 与真实执行天然一致。这也是 fork、恢复、回放可靠的根基。

## 能力 Seam：换提供方即换产品

seam 是 dsh 对「可替换能力」的完整定义，包含三种角色。

- Service Definition，声明接口，拥有自己的 ctx.<key>
- Service Provider，实现该接口
- Consumer，使用该接口，通常是面向模型的工具

shell 是规范范例。dsh-shell 定义接口，dsh-bash-local 与 dsh-bash-sandbox 是实现，dsh-tool-bash 是消费方。文件系统与进程提供方共享同一个执行世界，把它们指向远程沙箱，Bash、PTY 与 LSP 就一并搬了过去，无需提供方专用 fork。

仓库中类似的 seam 有几十个，举几例。

| Seam | 提供方 | 消费方 |
|---|---|---|
| ctx.llm | llm-deepseek、llm-pi-ai、llm-replay | agent-loop、compaction-basic |
| ctx.fs | fs-local、fs-sandbox、fs-e2b | tool-fs |
| ctx.subagents | spawn/fork-in-process、acp、codex、claude-code、dsh-sdk | tool-subagent、tool-subagent-control、tool-ralph |
| ctx.sessionPersistence | session-persistence-jsonl、session-persistence-sqlite | agent-loop、session-query |
| ctx.web | web-search-exa、web-search-perplexity、web-search-deepseek、web-fetch-http | tool-web |
| ctx.approval | acp | tools、tool-bash |

## 事件体系

dsh 把事件分成三个域。

- 持久会话事件，追加到日志并通过 `session/event` 广播，事实需要跨重启存在时使用
- `agent/*` 实时事件，携带活跃 Agent，用于观察或拦截进行中的工作
- 能力事件，向 seam 附加策略与适配器，无需导入循环

事件映射文档列出每个事件的生产方与消费方，共 60 个 harness 事件。插件作者面对的大多数改动，第一个决定都是选对事件域。

## Scope：按 agent 划分注册

scope 是 dsh 的按 agent 划分注册单位。一项贡献要么是全局的，要么归属于恰好一个 scope key。只有两层，扁平结构，带作用域的注册不会向下继承给 subagent。

两个关键机制。

- shadowing，最具体者胜出。带作用域的工具、片段、变量只在自身 scope 内替换同名的全局项，这是按 agent 定制 persona 与工具变体的机制
- restriction，`tools.restrict` 为单个 scope 过滤全局工具集合，被过滤掉的工具既不出现在提示词中，也拒绝执行，与不存在的工具无法区分

## Subagent 与 Ralph

subagent seam 与其他 seam 不同，同一上下文中可共存多个提供方实现，按名称注册。

支持两类委派。

- 一次性 subagent，start 后跑完返回
- 可继续 subagent，一份持久化子会话，至多关联一个进程内 Activation。Activation 可以执行多个 FIFO 轮次，支持冷恢复，后续消息唤醒同一 Activation 或冷启动新 Activation

提供方能力遵循 fail loud 原则，请求依赖提供方不具备的能力会被明确拒绝，绝不接受后静默降级。可继续子 agent 的权限来自确切的在线 Agent 工具上下文，已认证的 Agent 必须是持久化子 agent 记录的直接父级。

Ralph 循环是面向不可变目标的前台全新 agent 工作流。每个 Ralph Round 是一个全新子会话，不接收父会话或此前子会话的对话种子，通过一份有界的 Ralph 交接结构化报告跨 Round 传递状态，共享工作区仍是权威。

## 持久化与崩溃恢复

会话日志的持久化也是 seam，两个可互换后端，JSONL 与 SQLite，持久化同一套事件词汇。

几个值得抄的设计细节。

- `session/event` 是同步通知，持久化插件复制事件而不阻塞生产方，固定批处理窗口合并写入
- 崩溃恢复。后端加载一个轮次中途崩溃的日志，会发现打开的 turn/start 没有 turn/end。它不截断日志，而是追加一个合成的 `turn/end interrupted` 来配平被中断的执行
- SessionHeader 与事件日志分开存储，cwd、谱系、委派深度、agent preset 都是存储层元数据，不进入对话事件
- 格式版本拒绝。遇到不认识的日志版本，报「由更新的 harness 写入，请升级」或「本构建没有升级路径」，而不是报「损坏」

## Compaction：上下文管理

压缩是可选能力 seam，不属于 agent loop 主干。几个关键设计。

- `compaction/start` 到 `compaction/end` 包住整个操作，是日志记录的锁。中途崩溃表现为可检测的遗留锁，而不是一个虚假声称压缩完成的 end
- 摘要本身不新增事件类型，复用一条带 `surfaceOp replace` 的 user/message，这是摘要压缩执行的唯一 surface 变更
- 压缩前先做工具结果剪枝，只有剪枝或摘要生成推进了 surface 替换，才会开启全新的重试轮次
- token-meter 提供按会话隔离的回放 token 测量，压力消费方共享不可变且带修订版本的测量结果

## CLI、Web 与 Python SDK

dsh 的三种使用形态。

- `npx @deepseek-ai/dsh web` 启动 Web UI，默认 127.0.0.1:3080
- `dsh --profile headless` 一次性运行，打印最终答案后退出
- Python SDK 以子进程方式驱动内置运行时，客户端通过 stdio 使用按行分隔的 JSON-RPC 通信

CLI 的定位是 profile 启动器。`dsh --profile <name>` 启动具名 profile，`dsh plugin` 管理 profile 的插件。web 与 headless profile 首次使用自动初始化，其他 profile 通过 dsh plugin 创建。

## 工程文化：Agent Note

这个仓库几乎全是 AI 手笔。.agents/notes 下有 1372 篇 Agent Note，implemented 1012 篇，archived 285 篇，proposed 50 篇，rejected 22 篇。每篇记录一个决策、一个坑或一次事故复盘，包括 4 篇 postmortem。

文档工程也极重。docs 下中英双语配对维护，事件矩阵、能力图、配置目录、Cordis API 目录都由脚本从源码生成并校验，文档与代码的漂移被机械规则拦截。

## 与 Hermes 的对照

dsh 与 Hermes Agent 的设计哲学同向，但走得更远。

- Hermes 是「核心窄腰、能力在边缘」，dsh 是无特权内核，agent loop 本身可替换
- Hermes 的会话 DB 是运行记录，dsh 把「模型可见即已记录」上升为运行时不变式
- Hermes 用中间件与插件扩展，dsh 用事件瀑布加 seam，策略层插在模型与工具之间无需 fork
- seam 的 Service Definition 抽象与 A2A 的 Service 声明同频

## 评价

值得肯定的地方。

- 无特权内核是 agent 框架里少见的干净设计，扩展成本低
- 事件溯源让可观测性、恢复、回放天然一致
- 文档工程密度罕见，中英双语加机械校验
- 两天十万星的市场验证，说明方向被广泛认可

需要谨慎的地方。

- developer preview，官方明示将出现破坏兼容性的变更
- 体量庞大，219 个 npm 包，自托管与二次开发门槛不低
- 内核依赖 vendor 的 Cordis，核心决策被框架约束
- 版本 0.1.0-rc.5，API 尚未稳定

对想学 agent 架构的人，这份代码库是很好的教材。对想直接用的人，建议等版本稳定后再上生产。
