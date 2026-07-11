---
title: "从尝鲜到日常：Hermes Agent 深度使用一个月的新体会"
date: 2026-07-11
draft: false
categories: ["AI"]
tags: ["Hermes Agent", "AI Native", "Agent", "Mixture of Agents", "MoA"]
series: "AI Native探索"
description: "在解决了视觉与语音集成之后，这一个月我把 Hermes Agent 真正用进了日常——从 MoA 多模型协作、Skills 生态爆发到 Curator 自动归档，记录持续深化的使用体会和新踩的坑。"
toc: true
ai_generated: true
---

## 缘起

前两篇分别记录了 Hermes Agent 的安装配置、WeChat 集成、Skills 系统，以及视觉与 TTS 能力的扩展。那之后一个月，Hermes 从"尝鲜"变成了"日常"——我几乎所有的写作、学习、信息检索和轻量开发都通过它完成。这篇就聊聊这一个月来最深的几个体会。

## 一、Mixture of Agents：告别单一模型依赖

这一个月最大的架构变化，是全面启用了 **MoA（Mixture of Agents）** 模式。

以前是一个模型从头干到尾，优点简单直接，缺点也很明显：小模型快但容易漏细节，大模型稳但贵且慢。MoA 的做法是让多个模型协作——参考模型各自给出回答，聚合模型从中整合出最优结果。

我的主力预设 `Flash大王` 的配置如下：

```yaml
Flash大王:
  reference_models:
    - provider: opencode-go
      model: deepseek-v4-flash
    - provider: opencode-go
      model: mimo-v2.5
    - provider: opencode-go
      model: glm-5.1
  aggregator:
    provider: opencode-go
    model: deepseek-v4-flash
  fanout: per_iteration
```

三个参考模型各有侧重：deepseek-v4-flash 速度快、mimo-v2.5 中文理解好、glm-5.1 逻辑推理扎实。聚合模型不是简单地投票，而是综合三份输出做融合——有时候 Aggregator 会指出某个参考模型的疏漏，有时候会提取三个回答的不同优点拼成更完整的答案。

**实际感受**：质量比单模型稳定很多。写代码时三个模型同时给方案，聚合器能挑出最优的那个并补充缺失边界条件。但代价也很明显——token 消耗是单模型的 3-4 倍，第一轮回复的延迟会高一两秒，好在后续轮次因为上下文已加载，差别不大。

我现在保留了两个预设：`Flash大王`（日常主力）和 `Hardcore`（写复杂代码时切过去，用更大的参考模型）。切换命令也很简单，一句话的事。

## 二、Skills 生态：从几个脚本到一套知识体系

第一篇写的时候我只有五六个自定义 Skill。你猜多少？**六十多个**——63 个 Skill，分布在十几个分类目录下。

这不是突然膨胀出来的——是每天遇到新场景、踩了新坑、形成了一个重复模式，顺手就写成 Skill 保存了。Skill 的本质就是"把经验代码化"，一个月下来自然积少成多。按 Hermes 自身的分类目录梳理一遍：

| 分类 | 代表性 Skill |
|------|-------------|
| creative | `roleplay-immersion`、`humanizer`、`mermaid`、`drawio-academic-figure`、`html-artifact`、`visual-creation`、`roleplay-setup`、`rp-to-fiction` 等 |
| research | `thesis-writing`、`paper-audit`、`research-writing-skill`、`latex-paper-en/zh`、`typst-paper` |
| productivity | `chenhai-blog`、`blog-publishing`、`wechat-platform`、`soe-recruitment-research`、`tex2svg`、`bib-search-citation` 等 |
| software-development | `development-practices`、`subagent-driven-development`、`writing-plans`、`plan` |
| data-science | `a-share-quant`、`jupyter-live-kernel`、`scientific-toolkit-skill` |
| devops | `china-network-bypass`、`kanban-orchestration` |
| media | `music-creation`、`qwen-tts`、`web-scraping` |
| 其他 | `daily-learning`、`computer-use`、`apple-macos`、`github-workflow`、`obsidian-markdown`、`native-mcp` 等 |

最让我意外的是 Skill 生态的**复利效应**。每次写新 Skill 时都可以引用已有的 Skill 作为依赖，新工作流建立得越来越快。比如 `blog-publishing` 依赖 `chenhai-blog`，写学术文章时 `thesis-writing` 可以调用 `humanizer` 做润色。Skill 之间形成了隐形的依赖网络。

额外惊喜是 Hermes 的 `template_vars` 机制——Skill 里可以用 `{{ variable }}` 做模板占位，运行时自动填充当前上下文。我还没深入玩这个，但已经看到了更灵活的技能复用前景。

## 三、Curator：让记忆管理自动化

第一篇里我吐槽过 memory 上限的坑——2200 字符很快就满了，调大还得改 asar 源码。现在这个问题有了优雅的解法：**Curator**。

```yaml
curator:
  enabled: true
  interval_hours: 168      # 一周跑一次
  stale_after_days: 30     # 闲置 30 天标记为过期
  archive_after_days: 90   # 90 天自动归档
  consolidate: false       # 暂不启用合并（怕误伤）
```

Curator 每周自动检查一次所有会话和记忆条目，把长期不用的归档掉，把过期信息标记清理。部署一个月下来没出过问题——没有误归档重要会话，也没有删除不该删的记忆。

这个机制让我对 Hermes 的信任上了一个台阶。手动管理记忆太反人性了——人记不住自己忘了什么，机器能。自动化的归档策略意味着时间越久、记忆系统越干净，而不是越膨胀越臃肿。

## 四、踩坑续集

**坑 1：MoA 的短上下文问题**

MoA 模式下，聚合模型拿到的上下文是"三个参考模型的输出 + 原始用户消息"，信息量远大于单模型。但在需要大上下文（如处理长文档、多轮对话）时，token 消耗会膨胀得很快。我现在的策略是：日常用 MoA，处理超大上下文时切单模型。

**坑 2：Skills 太多之后的选择成本**

六十多个 Skill 听起来很爽，但 Agent 每次匹配技能时有一一检视的开销。config 里有个 `disabled` 列表，我把不再维护的旧 Skill 加进去（如早期的 `qwen-tts` 已被新的 TTS 配置替代），降低匹配负担。

## 五、"AI Native"的再理解

第一篇结尾我说"AI Native 是让人表达意图、AI 编排工具完成任务"。一个月后再看，我觉得还要加一层：**AI Native 也是让系统自己管理自己**。

MoA 让模型自己组织协作，Curator 让记忆自己清理归档，Skills 让经验自己积累复用。用户不再事无巨细地配置和管理，而是定义好策略和边界，然后放手让系统在日常中自然生长。

这比"人表达意图、AI 执行"更进了一步——AI 不仅在执行，还在自我维护、自我优化。我觉得这才是"Native"的真正含义。

---

*这篇文章就是用 Hermes Agent + Flash大王（MoA 预设）写的。从我在微信上说了句"写篇博客第三篇"到提交上线，全程由 Agent 协作完成。第一篇是单模型写、第二篇加了视觉语音、这一篇是 MoA 多模型协作写的——也算是对这个系列的一个元叙事总结了。*
