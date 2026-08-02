---
title: "llama.cpp 本地推理入门"
date: 2026-08-02
categories: ["AI"]
tags: ["llama.cpp", "GGUF", "本地推理", "量化"]
toc: true
ai_generated: true
description: "llama.cpp 入门学习笔记：GGUF 格式与量化原理、macOS 本地安装与使用、HTTP 服务与生态，以及与 vLLM 的选型对比。"
---

# llama.cpp 本地推理入门

## 一台普通电脑也能跑大模型

vLLM 那一套假设你有几块 GPU。llama.cpp 走的完全是另一条路：它是用 C++ 写的大模型推理库，目标是在 CPU 上跑、在苹果芯片上跑、在只有 8 GB 内存的笔记本上跑，让普通人不需要云 GPU 也能本地运行开源模型。

llama.cpp 由 Georgi Gerganov 在 2023 年 3 月发布，最初是把 Meta 的 LLaMA 模型移植到 C++，后来发展成覆盖大量模型架构的通用推理框架。它定义了 GGUF 模型格式，配套了量化工具链，还衍生出了 Ollama、llama.cpp 官方的 macOS 应用 llama.app 等一大批生态。

## GGUF 与量化

### GGUF 是什么

GGUF 是 llama.cpp 生态的模型文件格式，把权重、分词器、超参数、元数据打包成一个文件。一个模型就是一个 .gguf 文件，拷走即用，不需要 Python 环境，不需要依赖 PyTorch。

之前有过一版格式叫 GGML，2023 年 8 月起被 GGUF 取代。现在从 HuggingFace 上下模型，找 GGUF 后缀的版本就行。

### 量化是怎么回事

FP16 的 7B 模型权重约 14 GB，多数人的电脑装不下。量化就是把权重从高精度存成低精度，牺牲一点质量换体积和速度。llama.cpp 的量化在导出时就完成，生成的文件直接是低精度的，推理时不再需要原始权重。

量化等级用 Q 加数字表示，数字越小越省内存、质量损失越大。常用的几个：

| 等级 | 说明 |
|------|------|
| Q2_K | 最小，质量损失明显 |
| Q4_K_M | 体积质量均衡，最常用的默认选择 |
| Q5_K_M | 质量更好，体积略大 |
| Q8_0 | 接近无损，体积约为 FP16 的一半 |
| F16 | 不量化，原始精度 |

Q4_K_M 是大多数人的入门选择。7B 模型量化到 Q4_K_M 后大约 4 GB 出头，16 GB 内存的 MacBook 跑起来很轻松。选型口诀：内存紧张用 Q4_K_M，追求质量用 Q5_K_M，追求极限省内存用 Q2_K。

### 模型从哪来

HuggingFace 上每个热门模型基本都有 GGUF 版本。可以下载官方量化版，也可以用 llama.cpp 自带的转换脚本把原始权重转成 GGUF、再量化成目标精度。后者适合冷门模型或者想自己控制量化参数的场景。

## 快速上手（macOS）

### 安装

macOS 上最省事的是 Homebrew：

```bash
brew install llama.cpp
```

装完会有一组命令，最常用的是 `llama-cli`（命令行聊天）和 `llama-server`（HTTP 服务）。也可以去 GitHub Releases 下载官方二进制，或者源码编译。

### 命令行聊天

下载一个模型文件，比如 Qwen2.5-7B-Instruct 的 GGUF，然后：

```bash
llama-cli -m qwen2.5-7b-instruct-q4_k_m.gguf -p "用一句话介绍你自己"
```

首次运行会加载模型，之后就是交互式对话。`-c` 参数可以控制上下文长度，`--temp` 控制随机性。在纯 CPU 的机器上，7B 模型大概每秒几个 token，能接受；苹果芯片用上 Metal 加速后会快不少。

### 起一个 HTTP 服务

```bash
llama-server -m qwen2.5-7b-instruct-q4_k_m.gguf --port 8080
```

llama-server 提供 OpenAI 兼容的 API，所以客户端写法跟 vLLM 一模一样，只是 base_url 换成 8080 端口：

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8080/v1", api_key="EMPTY")
resp = client.chat.completions.create(
    model="qwen2.5-7b-instruct",
    messages=[{"role": "user", "content": "你好"}],
)
print(resp.choices[0].message.content)
```

本地起一个 llama-server，局域网内其他机器都能访问，做个人工具、知识库问答的推理后端足够了。

## 加速后端

llama.cpp 的一大特点是后端可插拔，同一套代码在不同硬件上选不同的加速方案：

- CPU：x86 用 AVX2/AVX512 指令集加速，ARM 用 NEON
- Apple Silicon：Metal 后端，用 GPU 加速，Mac 上体验最好的方案
- NVIDIA：CUDA 后端
- 其他：Vulkan（跨平台通用）、SYCL（Intel）、ROCm（AMD）

在 Mac 上，只要模型和量化等级选得合适，Metal 加速后的速度对日常使用完全够用。

## 生态与衍生

llama.cpp 的生态比它自己大得多：

- Ollama：最流行的本地模型管理工具，底层就是 llama.cpp，封装了模型下载、服务、命令行体验
- llama.app：官方出的 macOS 应用，下载即用
- llama-cpp-python：Python 绑定，可以在 Python 里直接调用
- llama.cpp 社区后端被大量嵌入到各类开源工具中

## 和 vLLM 怎么选

两条路解决的是不同问题，没有优劣，只有适配场景：

| 维度 | llama.cpp | vLLM |
|------|-----------|------|
| 定位 | 本地单机推理 | 生产级服务 |
| 硬件 | CPU、苹果芯片、低显存 | 主要面向多 GPU |
| 显存占用 | 量化后极小 | 追求吞吐，吃显存 |
| 并发 | 个人使用级别 | 高并发、高吞吐 |
| 安装 | 一个二进制或 brew | pip 装 + 显存要求 |
| 典型场景 | 个人笔记本、隐私敏感场景 | 线上 API 服务、批量推理 |

判断标准很简单。只有一台笔记本，想跑开源模型玩一玩，或者数据不能出本机，选 llama.cpp 路线。有 GPU 服务器，要对外提供服务、扛并发，选 vLLM。

## 学习路线

1. 先用 brew 装好，下载 Q4_K_M 模型，跑通 `llama-cli`
2. 用 `llama-server` 起服务，用 OpenAI SDK 调用
3. 换不同量化等级，对比体积、速度、输出质量
4. 用转换脚本自己量化一个模型，理解 GGUF 结构
5. 看后端抽象层，理解不同硬件如何接入

## 相关阅读

- [vLLM 推理引擎入门](/posts/AI/vLLM-推理引擎入门/)：另一条推理路线，面向生产服务
- [模型部署与推理优化](/posts/AI/08-模型部署与推理优化/)：博客里更系统的部署知识汇总
