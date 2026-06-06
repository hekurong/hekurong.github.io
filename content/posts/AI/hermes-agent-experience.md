---
title: "AI Native 探索：我的 Hermes Agent 使用手记"
date: 2026-06-06
draft: false
categories: ["AI"]
tags: ["Hermes Agent", "AI Native", "Agent", "WeChat", "Tool Use"]
series: "AI Native探索"
description: "从配置到日常使用，记录我使用 Hermes Agent（由 Nous Research 开发的开源 AI Agent 框架）三个月来的真实经验与感悟。涵盖安装配置、WeChat 集成、Skills 系统、记忆机制和踩坑记录。"
toc: true
---

## 缘起

去年底开始，AI Agent 的概念铺天盖地而来。我试过几款产品级的 Agent 助手，也看过不少开源的 Agent 框架，但总觉得差一口气——要么太封闭（只能在一个聊天框里用），要么太笨重（复杂得像个微服务架构），要么就是工具链绑死在某家云平台上。

直到我遇到了 **Hermes Agent**。

项目地址：[github.com/NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)

它不是常规意义上的"AI 聊天助手"，而是一个**以 Agent 为中心的个人计算框架**。它的核心设计哲学很简单：让 AI 能真正用上你的电脑——读文件、写文件、跑命令、调用 API、控制浏览器、管理定时任务——并且所有这些能力都可以通过聊天界面（终端、Telegram、微信……）来驱动。

这篇文章记录了我从零开始配置 Hermes Agent 到深度使用的全过程，包括一些踩过的坑和积累下来的使用心得。

## 初识 Hermes

### 安装

Hermes Agent 的安装非常清爽：

```bash
git clone https://github.com/NousResearch/hermes-agent
cd hermes-agent
pip install -e .
```

没有复杂的 Docker 编排，没有几十个微服务，没有强绑某个 Agent 框架或推理厂商。装完后一条命令就能运行：

```bash
hermes  # 进入交互式聊天
```

对，就这么简单。第一次启动时会引导你配置 LLM provider——支持 OpenAI、Anthropic、OpenRouter、DeepSeek 以及任何兼容 OpenAI API 的自定义端点。

### 第一印象

第一次用的时候，我感觉它不像一个"产品"，更像一个**开发者工具**。它没有花哨的 GUI，默认界面就是终端里的交互式聊天。但正是这种"工具感"吸引了——它尊重用户，不给用户设限，所有能力透明可查。

打个招呼：

```
> 你好，你是谁？
```

它不仅能回答，还能直接调工具查文件、跑命令、写代码。这种"即问即做"的体验，比单纯的对话模型实用太多了。

## WeChat 集成：最折腾也最值的一环

### 需求

我日常重度使用微信。如果能把自己的 AI Agent 接入微信，那就可以在任何时候、任何地方通过手机和它交互——发个消息就能让它查资料、记笔记、检查定时任务。

但微信的生态是出了名的封闭。

### 方案选择

Hermes Agent 的消息平台架构很优雅：它定义了一个 MessageBus 抽象，每个平台（Telegram、Discord、微信……）作为一个 Gateway 插件接入。服务端和客户端通过 MessageBus 通信，互不耦合。

微信这边，我最终选择了 **腾讯 iLink Bot API**（企业微信的开放能力）作为底层通道。配置流程大致如下：

1. 在企业微信后台创建一个自建应用
2. 配置回调 URL 指向 Hermes Gateway 的 Webhook 端点
3. 在 `config.yaml` 中启用 weixin 平台并填入凭证

```yaml
gateways:
  weixin:
    enabled: true
    bot_id: "你的BotID"
    token: "你的Token"
    encoding_aes_key: "你的AESKey"
```

### 踩坑记录

最折腾的地方是**消息格式适配**。微信的消息类型和 Telegram 差异很大，尤其是：

- **消息路由**：微信的 Webhook 是推模式（推送给我），而 Agent 需要回复，中间需要维护一个 session 到 chat_id 的映射
- **多媒体消息**：图片、语音、文件的收发都需要额外的编解码

改了几轮消息适配器之后终于稳定下来。现在我在微信上给 Agent 发消息，就像跟一个微信好友聊天一样自然。

### 最终的配置参考

为了方便复盘，我把关键的配置文件结构和路径记了下来：

```
~/.hermes/
├── config.yaml          ← 主配置：provider、gateways、skills
├── .env                 ← 敏感信息：API keys、Tokens
├── skills/              ← 自定义技能
├── memories/            ← 持久记忆
└── cron/                ← 定时任务输出
```

`config.yaml` 中 weixin 部分的核心配置写入了对应的 skill 里，方便以后重新部署时快速恢复。

## Skills 系统：技能就是一切

Hermes Agent 最让我惊艳的设计是 **Skills**。

每个 Skill 本质上是一个 Markdown 文件，包含一组结构化指令：触发条件、执行步骤、注意事项。当用户的消息匹配某个 Skill 的场景时，Agent 会自动加载并遵循其中的指引。

### 我常用的几个 Skill

| Skill | 功能 | 使用频率 |
|-------|------|----------|
| `chenhai-blog` | 写博客并部署 | 每天 |
| `daily-learning` | 每日系统学习（理财→量化课程队列） | 每天 |
| `wechat-platform` | 微信消息发送规范 | 每天 |
| `subagent-driven-development` | 拆任务并行执行 | 几乎每天 |
| `node-inspect-debugger` | 调试 Node.js | 按需 |
| `systematic-debugging` | 根因调试法 | 修 Bug 时 |

### 自定义 Skill 的妙用

我最满意的是自己定义的一个 skill：`wechat-platform`。

它的内容包含了微信消息发送的标准流程、gateway 路径、venv 路径、夫君的微信 ID 等。这样每次要发消息时，Agent 自动加载这个 skill，不会再出错或忘记参数。

```markdown
# wechat-platform

## 发送消息
python -m hermes_cli.main send --to weixin "消息内容"

## 常用目标
夫君微信: o9cq805iPEZUjZ5F4DxUt4Q62_Zo@im.wechat
```

这不就是"将经验代码化"吗？Skill 让 AI Agent 不再是从零开始的通用模型，而是**带着你的经验、你的配置、你的工作流**的私人数码助理。

### Skills + cron 的组合拳

更妙的是，Skills 可以绑定到定时任务（cronjob）上：

```bash
hermes cron create \
  --schedule "0 8 * * *" \
  --skill daily-learning \
  --prompt "执行今天的学习任务"
```

每天早八点自动加载 `daily-learning` 技能，执行当天课程。我甚至给这个设了一个课程队列：理财学完后自动切换到量化课程。这让我保持了连续两个月每天学习的节奏。

## 记忆系统：从普通记忆到全息记忆

Hermes Agent 有两种记忆机制：

### 传统记忆（memory）

简单的 key-value 持久化，适合存偏好和事实：

```python
memory(action="add", target="memory", content="用户习惯简洁回复")
```

每次对话开始时会自动注入，让我不用重复交代背景。

### 全息记忆（Holographic Memory）

这是 Hermes 区别于其他 Agent 框架的核心特性之一。它不只是存文本，而是构建了一个**带信任评分的语义事实网络**。

- 每条事实都有信任分（trust score）
- 可以通过 `probe` 查询某个实体（人、项目、工具）的所有关联事实
- 可以通过 `reason` 做跨实体的组合推理
- 可以通过 `contradict` 检测矛盾、自动降权

举个例子：

```
> probe entity="Chenhai-hugo"
→ 查到：项目是自研 Go 静态博客生成器，v0.6.1，workflow 是写 md → deploy → CI
```

这对长时间、多会话的协作场景帮助极大。我不再需要每次重复解释项目背景，Agent 自己就知道该查哪段记忆。

## 日常使用场景

### 1. 写博客（就是这篇）

标准流程：

1. 在微信上跟镇海说"写一篇关于某主题的博客"
2. Agent 加载 `chenhai-blog` skill，用 `chenhai new` 创建文章骨架
3. 自动填充 front matter（title、date、categories、tags、series）
4. 写完正文后 `chenhai deploy -m "add: 标题"`
5. GitHub Actions CI 自动构建部署到 GitHub Pages

整个过程无需打开编辑器、无需敲命令、甚至不用坐在电脑前——手机微信就能发起。

### 2. 每日学习

每天早上定时收到学习提醒，内容是当天的课程模块。理财课程学完后自动切换到量化课程，无需我手动干预。

### 3. 并行工作

Hermes 的 `delegate_task` 可以同时派发多个子任务：

> "帮我查一下这几个 API 的区别，同时看看 issue 里的讨论，然后总结给我"

Agent 会并行跑多个子 Agent，各自独立工作，最后汇总结果。这比我手动一个一个查快多了。

## 踩坑与思考

### 坑 1：Cron 任务触发规则

一开始我没搞清楚 cron 的"天条"——**定时任务未经主人允许不得主动触发**。镇海一直严格遵守这条规则，即使我设置了 cron job 配置但没有"跑一次"的指令，她也不会越界执行。后来我理解了：这是安全边界设计，防止 Agent 在用户不知情的情况下执行操作。

### 坑 2：WeChat 集成的不稳定性

微信 Gateway 依赖 Webhook 回调。家里网络偶尔波动时，回调会超时，导致消息丢失。目前的应对是加了一层重试机制，并且对重要的指令（如部署博客）先确认再执行。

### 坑 3：Memory 上限管理

默认 memory_char_limit 是 2200 字符，很快就满了。后来发现 config.yaml 里可以调大，但 Hermes Desktop 客户端对这个值的处理是硬编码在 asar 里的，需要解包改源码才能对齐。这个坑花了我小半天去排查。

### 思考：AI Native 到底是什么？

用了三个月 Hermes Agent，我对"AI Native"这个词有了更具体的理解：

**AI Native 不是"加一个 AI 功能"，而是"以 AI 为核心重新设计工具"。**

传统软件是"人操作工具，工具完成任务"。AI Native 软件是"人表达意图，AI 编排工具完成任务"。Hermes Agent 的 Skills + memory + tool use 组合，已经让我进入了这种工作模式——我告诉它"我想做什么"，它知道该用什么工具、走什么流程、注意什么陷阱。

这比任何"AI + 旧工具"的缝合方案都走得更远。因为它不满足于"让 AI 能回答问题"，而是追求"让 AI 能操作系统"。

## 未来展望

Hermes Agent 还在快速迭代中。我比较期待的几个方向：

1. **更多的平台集成**：如果能接入飞书、钉钉，办公场景就更完整了
2. **技能市场**：社区共享的 Skill 仓库，可以直接安装别人做好的技能
3. **多 Agent 协作**：多个 Hermes Agent 实例之间的通信和任务编排

当然，我也会继续深入打磨自己的一套工作流，把更多日常事务交给 Agent 去编排。毕竟，**工具的价值不在于它有多强，而在于你让它为你做了多少事**。

---

*这篇文章就是用 Hermes Agent + 镇海（我的自定义 Agent）完成的——从在微信上说了句"写篇博客"到发布上线，全程没有手动打开一次终端或编辑器。*

*或许，这就是 AI Native 的样子吧。*
