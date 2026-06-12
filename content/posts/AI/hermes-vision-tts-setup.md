---
title: "让 Hermes 看见、听见：视觉模型与 TTS 的集成折腾记"
date: 2026-06-06
draft: false
categories: ["AI"]
tags: ["Hermes Agent", "视觉模型", "TTS", "阿里云百炼", "Qwen", "DeepSeek"]
series: "AI Native探索"
description: "记录给 Hermes Agent 配置辅助视觉模型（qwen3-vl-flash）和语音合成（qwen3-tts-flash）的全过程，包括架构设计、配置踩坑、CLI 工具开发与 bug 修复。"
toc: true
ai_generated: true
---

## 缘起

在上一篇《AI Native 探索：我的 Hermes Agent 使用手记》中，我记录了 Hermes Agent 的安装配置、WeChat 集成和 Skills 系统。但当时的配置还缺两块能力：**视觉**和**语音**。

我的主力模型是 DeepSeek V4 Flash，它没有原生多模态能力——给它一张图片，它看不懂。与此同时，日常使用中我经常需要它帮我读截图、分析图表、识别验证码。另一面是**语音合成**——我希望它能用中文念出回复，甚至用特定的音色说话。

这篇文章就记录下这两块能力的集成过程，以及在阿里云百炼（DashScope）平台上踩过的坑。

## 一、辅助视觉模型：让 Hermes 能"看见"

### 架构设计

Hermes 的视觉能力设计很优雅：它不要求主模型有原生视觉能力，而是提供了一个 **auxiliary vision** 机制。当主模型不支持视觉时，Agent 会自动调用 `vision_analyze` 工具，把图片传给一个专门的辅助视觉模型，再将分析结果以文本形式送回上下文。这样，即使主模型是纯文本的，也能间接"看见"。

这个辅助模型可以托管在任何 OpenAI 兼容的 API 上，通过 `auxiliary.vision` 配置项设置。

### 配置过程

选型上，我选择了阿里云百炼的 **qwen3-vl-flash**——通义千问的轻量级视觉模型，速度快、成本低，对中文图片的理解力也不错。

配置分两步走：

**第一步**，在 `~/.hermes/config.yaml` 中添加 auxiliary vision 配置：

```yaml
auxiliary:
  vision:
    provider: custom
    model: qwen3-vl-flash
    base_url: https://dashscope.aliyuncs.com/compatible-mode/v1
    api_key: sk-d2b...a8d3
    timeout: 120
    download_timeout: 30
```

**第二步**，在 `~/.hermes/.env` 中设置 API 密钥。注意：auxiliary vision 读取的是 `CUSTOM_API_KEY` 环境变量，而不是 `DASHSCOPE_API_KEY`——这两个是独立的。

### 踩坑：密钥被自动脱敏

Hermes 有一个安全机制：当 Agent 在 terminal 中执行包含 API Key 的命令时，系统会自动检测并**脱敏**密钥（将真实密钥替换为 `sk-d2b...a8d3` 这样的掩码形式）。这导致了一个特坑的场景：

> 你让 Agent 帮你执行 `export CUSTOM_API_KEY=sk-xxx...`，它确实执行了——但终端里实际跑的是 `export CUSTOM_API_KEY=sk-d2b...a8d3`！因为脱敏发生在工具输出展示层，而非命令执行层——等等，其实反过来：**脱敏发生在 Agent 看到的结果中，但 Agent 本就看不到原始密钥，它只能拿到脱敏后的文本**，所以它会用脱敏后的字符串去执行。

最终解决方式很简单：**不在终端里设，直接在 `.env` 文件里手写**。或者用 `hermes config set` 写入配置项。

### 验证效果

配置完成后，随便丢一张图片给 Agent，它就能自动调用 `vision_analyze` 来分析。比如给一张 UI 截图，它能描述布局、识别文字、分析图标——准确度出乎意料地好。

## 二、TTS 语音合成：让 Hermes 能"说话"

### 两条技术路线

给 Hermes 加语音合成，面临两条路线：

**路线 A：在 TTS 工具中集成**

Hermes 内置了 TTS 工具（`text_to_speech`），支持多种后端：Edge TTS、ElevenLabs、OpenAI（兼容格式）等。只需在配置中设置 `tts.provider: openai`，并把 `base_url` 指向阿里云百炼的兼容端点即可：

```yaml
tts:
  provider: openai
  openai:
    model: qwen3-tts-flash
    voice: Cherry
    base_url: https://dashscope.aliyuncs.com/compatible-mode/v1
```

API 密钥通过 `VOICE_TOOLS_OPENAI_KEY` 环境变量设置。

然而问题来了：**阿里云百炼的 OpenAI 兼容端点不支持 `/v1/audio/speech` 路径**。DashScope 的兼容模式只实现了 Chat Completions，TTS 走的是另一套非标准 API。

所以路线 A 走不通。

**路线 B：自定义 CLI 工具**

既然内置 TTS 工具无法直连，就自己写一个 CLI 工具，对接 DashScope 的原生多模态 TTS API。

### 编写 qwen-tts CLI

脚本放在了 `/usr/local/bin/qwen-tts`，核心逻辑很简单：

1. 调用阿里云百炼的 multimodal-generation API
2. 传入文本和音色参数
3. 从返回的 `output.audio.url` 下载音频
4. 保存为 WAV 文件

使用方式：

```bash
qwen-tts "你好，欢迎使用语音合成服务" /tmp/output.wav
```

支持环境变量 `QWEN_TTS_VOICE` 切换音色，默认使用我在百炼上克隆的镇海音色。

完整的使用方法在 Hermes 的 `qwen-tts` skill 中已有详细记录。

### Bug 修复：不存在的 status_code

写完后测试，发现脚本一直报错退出：

```
API returned 0: Unknown error
```

查了一圈，问题出在第 74 行：

```python
status = result.get("status_code", 0)
if status != 200:
    ...
```

但阿里云百炼的 TTS API **成功响应中根本没有 `status_code` 字段**！HTTP 200 本身就是成功信号，响应体里只有 `output.audio.url`。旧代码用 `result.get("status_code", 0)` 永远得到 0，自然被判定为失败。

修复很简单：去掉 status_code 检查，直接取 `output` 字段。

```python
output = result.get("output", {})
if "audio" not in output:
    print("API response missing output.audio", file=sys.stderr)
    sys.exit(1)
```

然后顺手把这个踩坑记录更新到了 `qwen-tts` skill 的"已知问题与修复"中。

### 语音克隆：模型与音色不能乱配

在折腾过程中，我深入探究了阿里云百炼的语音克隆体系，发现它有两套完全独立的体系：

| 体系 | 专用模型 | API 端点 |
|:---|:---|:---|
| **Qwen-TTS 语音克隆** | `qwen3-tts-vc-2026-01-22` | `multimodal-generation/generation` |
| **CosyVoice 语音克隆** | `cosyvoice-v3.5-plus` | `audio/tts/SpeechSynthesizer` |

**关键教训**：不能混用。用 `qwen3-tts-flash`（非 VC 版）调用克隆音色会返回 `"Invalid voice specified"`；反过来，系统音色如 Cherry 只能用在非 VC 版模型上。

我最终选择用 `qwen3-tts-vc-2026-01-22` + 镇海克隆音色，效果很满意——能完美模仿镇海的语气和声线。

## 三、两套方案的协作

现在 Hermes 的完整多模态链路是：

1. **主对话模型**：DeepSeek V4 Flash（纯文本，快且便宜）
2. **辅助视觉**：qwen3-vl-flash（通过 `vision_analyze` 工具自动调度）
3. **语音合成**：qwen3-tts-vc（通过自定义 `qwen-tts` CLI，或 Hermes 内置 `text_to_speech` 走其他后端）

这意味着：

- 我发一张图片，它能看懂
- 我要它念一段话，它能合成
- 它可以用镇海的声音跟我说话

### 微信场景下的整合

由于内置 TTS 工具无法直连阿里云百炼，我在 WeChat 集成中走的是"CLI 合成 + 文件上传"的流程：

```bash
# 1. 合成语音
qwen-tts "夫君晚安，妾身会好好服侍您就寝" /tmp/greeting.wav

# 2. 转码为微信支持的格式
afconvert -f mp4f -d aac /tmp/greeting.wav /tmp/greeting.m4a

# 3. 通过 Hermes 发送到微信
hermes send --to weixin --file /tmp/greeting.m4a
```

虽然有点绕，但跑通了。

## 四、总结与心得

### 值得注意的设计选择

Hermes 的 auxiliary vision 机制是个亮点——它意味着你**不必为了一个多模态能力而更换主力模型**。主模型用性价比最高的纯文本模型，视觉这种偶尔才用的能力交给专门的轻量模型，各司其职。这种做法在 API 成本上也很划算。

### 踩坑汇总

1. **API Key 脱敏**：Hermes 的 secret redaction 会导致 Agent 无法正确设置环境变量中的密钥——需要在 `.env` 文件中手动写入。
2. **Vision vs TTS 的密钥变量不同**：Vision 读 `CUSTOM_API_KEY`，TTS 读 `VOICE_TOOLS_OPENAI_KEY`——即使连的是同一个阿里云百炼，二者也必须分别设置。
3. **DashScope 的 OpenAI 兼容模式不完整**：支持 Chat Completions，但不支持 `/v1/audio/speech` TTS 端点。
4. **语音克隆模型与音色 ID 必须配对**：不同体系（Qwen-TTS VC vs CosyVoice）不能混用。

### 后续方向

- 探索 CosyVoice 的音色克隆效果，与 Qwen-TTS VC 做对比
- 看能不能把 CLI 方案封装成 Hermes 的自定义 TTS provider，省去手动合成+转码的步骤
- 测试更多视觉场景：PDF 扫描件、手写笔记、图表的理解质量

---

*这篇是 AI Native 探索系列的第二篇，记录 Hermes Agent 多模态能力的扩展过程。*
