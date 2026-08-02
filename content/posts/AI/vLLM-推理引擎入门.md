---
title: "vLLM 推理引擎入门"
date: 2026-08-02
categories: ["AI"]
tags: ["vLLM", "LLM", "推理引擎", "部署"]
toc: true
ai_generated: true
description: "vLLM 入门学习笔记：它解决什么问题、PagedAttention 与连续批处理等核心机制、快速上手部署与调优路线。"
---

# vLLM 推理引擎入门

## 从「模型能跑」到「模型能扛住流量」

训练好的大模型，拿起来就能推理，但那是「能跑」。到了生产环境，几十上百个请求同时进来，显存只有几十 GB，每个请求还要拖着越来越长的上下文，显存和带宽的压力立刻就压上来了。vLLM 就是在这一层解决问题的推理引擎。

业界常用吞吐量（每秒生成多少 token）来衡量推理引擎的优劣，一个调度得当的引擎，比直接用 Transformers 逐条推理的朴素做法能高出近一个数量级。差距不在模型本身，而在显存和算力被浪费了多少。

vLLM 是伯克利团队发起的开源项目，从 2023 年开源到现在，已经成为事实上的大模型推理服务标准之一。OpenAI 兼容的接口、一行命令起服务、主流开源模型开箱即用，这几件事让它成了很多团队部署 LLM 的第一选择。

## 推理慢在哪里

### KV Cache 是内存大户

Transformer 解码是逐 token 生成的。生成第 100 个 token 时，前 99 个 token 的 Key 和 Value 向量其实已经在注意力计算里算过了，缓存下来就能避免重复计算。这个缓存叫 KV Cache。

KV Cache 有多大？以 8B 级别模型为例，每个 token 的 KV 缓存大约占 128 KB（具体取决于层数、KV 头数和精度，不同模型差异不小）。生成 4096 个 token 就要约 512 MB，上下文拉到 128K 就是 16 GB 的量级，而且它是动态增长的，每生成一个 token 都要追加。规模更大的模型，这个数字还要再翻几倍。

### 显存碎片

朴素实现里，每个请求都要预分配一块连续显存来存它的 KV Cache，大小按最大上下文预留。可实际生成长度参差不齐，预留多了浪费，预留少了放不下。请求一多，显存碎片化严重，明明总量够用，却塞不下新请求。

### 动态长度的批处理

推理要做批处理才能吃满 GPU，但 LLM 请求的长度差异巨大，短的几十 token 就结束，长的可能上千。如果等一个 batch 里所有请求都生成完再一起结算，短的请求白等；如果随时腾出位置给新请求，又涉及显存的动态管理。这两难，朴素实现处理得很笨拙。

## 三个核心机制

### PagedAttention 与分页显存

vLLM 最初一战成名靠的就是 PagedAttention，思路借鉴操作系统里的虚拟内存分页。KV Cache 不再要求连续存储，而是切成固定大小的块，像内存页一样按需分配，物理上零散、逻辑上连续。

好处是立竿见影的。显存碎片几乎消失，利用率大幅提升；同一个前缀（比如系统提示词）的 KV 块可以被多个请求共享，进一步省显存。这也是 vLLM 吞吐量远超朴素实现的主要原因。

这个机制后来有了变化。2025 年 vLLM 重构了执行引擎（v1 引擎），到 v0.25 版本，旧的 PagedAttention 实现被移除，由新的 Model Runner V2 统一接管执行路径，分页 KV 缓存的思想被吸收进了新架构，同时支持了更多新特性。所以现在看 vLLM 的源码，找不到名为 PagedAttention 的旧模块，但「按页管理 KV Cache」这个核心思路依然是它的底色。

### 连续批处理（Continuous Batching）

vLLM 的调度器按 token 粒度调度，而不是按请求粒度。一个请求生成了它的最后一个 token，立刻结算、立刻腾出位置，新的请求马上补进来。GPU 的算力始终在处理有效 token，不会因为某个请求提前结束而空转。

### 前缀缓存（Prefix Caching）

大量生产请求共享同一个系统提示词或文档前缀。vLLM 会缓存这些前缀对应的 KV 块，新请求如果前缀一致，直接复用，省掉重复计算。在 RAG 场景里，长文档作为公共前缀反复出现，这一项能省下可观的首 token 延迟。

## 快速上手

### 安装

vLLM 用 pip 安装，需要 Linux 环境加 NVIDIA GPU（也支持 AMD、Intel 等平台，但对大多数人来说，NVIDIA 是默认路径）。Windows 原生支持有限，一般建议 WSL 或 Linux 服务器。

```bash
pip install vllm
```

### 一行命令起服务

```bash
vllm serve Qwen/Qwen2.5-7B-Instruct --port 8000
```

vLLM 会自动去 HuggingFace 下载模型权重，起一个 OpenAI 兼容的 HTTP 服务。然后可以用任何 OpenAI SDK 客户端调用：

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8000/v1", api_key="EMPTY")
resp = client.chat.completions.create(
    model="Qwen/Qwen2.5-7B-Instruct",
    messages=[{"role": "user", "content": "介绍一下你自己"}],
)
print(resp.choices[0].message.content)
```

### 离线批量推理

不想起服务，只做一次性的批量推理，可以直接用 Python 接口：

```python
from vllm import LLM, SamplingParams

llm = LLM(model="Qwen/Qwen2.5-7B-Instruct")
params = SamplingParams(temperature=0.7, max_tokens=512)

outputs = llm.generate(
    ["写一段介绍北京的话", "翻译这句话成英文"],
    params,
)
for output in outputs:
    print(output.outputs[0].text)
```

### 常用启动参数

| 参数 | 作用 |
|------|------|
| `--max-model-len` | 最大上下文长度，按显存调整 |
| `--gpu-memory-utilization` | 允许使用的显存比例，默认 0.9 |
| `--tensor-parallel-size` | 张量并行卡数，多卡时设置 |
| `--quantization` | 量化方式，如 awq、gptq、fp8 |
| `--enable-prefix-caching` | 开启前缀缓存 |
| `--dtype` | 推理精度，如 bfloat16 |

## 进阶方向

### 量化

7B 模型 FP16 权重就要 14 GB，量化后能大幅降显存。vLLM 支持多种量化方式：AWQ、GPTQ 是训练后量化，FP8 在较新显卡上是热门选择，NVFP4 等低比特方案也在持续跟进。量化精度损失通常可控，部署成本下降明显。

### 张量并行与流水线并行

单卡放不下模型时，把权重切到多张卡上。张量并行把单层算子拆到多卡协同计算，流水线并行把层切段分发。vLLM 也支持数据并行与张量并行组合，多路请求各自跑、共享权重，吞吐量随卡数接近线性扩展。

### v1 引擎

vLLM 从 v0.6 开始重写核心引擎，到 v0.8 之后 v1 成为默认。v1 引擎重构了调度与执行架构，把 prefix caching、多模态、投机解码等特性统一进去，支持全量 CUDA graph，性能更稳。现在写新代码直接基于 v1 即可，不用关心旧引擎的兼容问题。

## 学习路线

vLLM 的代码库很大，直接扑源码容易迷路。建议的顺序：

1. 先把服务跑起来，用 OpenAI SDK 反复调用，熟悉行为
2. 理解 KV Cache 与显存的关系，看官方文档的架构图
3. 读调度器的核心数据结构，理解请求是怎么被切分和调度的
4. 用 `--tensor-parallel-size` 上多卡，理解分布式推理
5. 感兴趣再深入 v1 引擎源码

## 相关阅读

- [模型部署与推理优化](/posts/AI/08-模型部署与推理优化/)：博客里更系统的部署知识汇总
- [llama.cpp 本地推理入门](/posts/AI/llama.cpp-本地推理入门/)：另一条推理路线，主打本地单机
