---
title: "Langfuse 自托管实录：单机 K8s 上的 Helm 部署与四个坑"
date: 2026-08-08
draft: false
categories: ["AI"]
tags: ["Langfuse", "Kubernetes", "Helm", "OpenTelemetry", "LLMObservability", "自托管"]
description: "在 Docker Desktop 单机 K8s 上自托管 Langfuse 的完整实录：选型决策、Helm 安装、values 调优，以及 Bitnami 镜像失效、Node OOM、ClickHouse 副本泛滥、OTLP 路径藏匿四个坑的排查过程。"
toc: true
ai_generated: true
---

## 缘起

做多 Agent 项目到了一定阶段，光有日志和 JSONL 轨迹已经不够看了——需要一个平台级的评估与观察基础设施：trace 详情、token 用量、LLM-as-Judge 评估、数据集回归。调研了一圈（Langfuse、Opik、Phoenix、AgentOps、OpenLIT 等 15 个平台），最终选定 **Langfuse**：社区最大（33k+ star）、Helm 部署成熟、评估能力全覆盖、OTel 原生接收。本文记录在 Docker Desktop 单机 K8s 上的完整部署过程与四个实打实的坑。

## 选型与版本决策

先说版本决策，这是最容易踩但最容易被忽略的一步。

Langfuse 最新主版本是 v4（宣传"实时、快 165 倍"），但 **v4 要求 ClickHouse ≥ 25.12**，而官方 Helm chart 捆绑的 ClickHouse 停留在 25.2 附近——官方文档自己都建议现有用户"暂缓迁移"。也就是说：

- 直接 `helm install` 默认 chart → 装出来是 **v3**（app 3.224.1）
- 想装 v4 → 必须外接 ClickHouse 25.12+，官方推荐路线是 cert-manager + ClickHouse Operator（3 副本 Keeper + 3 副本 ClickHouse + 100Gi 磁盘），对单机 8GB 内存的本地集群是杀鸡用牛刀

我的选择：**先装 v3 全家桶**。本地数据量极小，v4 的性能优势无意义；等 chart 捆绑的 ClickHouse 支持 v4 再迁移，有官方迁移脚本兜底。

## 动手前的前置验证

安装是高耗时操作，动手前把能验证的都验证掉，避免装到一半才发现断点：

```bash
# 1. helm 是否已装？（我机器上没装，先 brew install helm）
brew install helm && helm version --short

# 2. chart 仓库可达性
curl -sI https://langfuse.github.io/langfuse-k8s/index.yaml

# 3. 把 chart 下载解压，抠出全部镜像 tag 逐个验证
#    （这步最关键：chart 会拉 6 个镜像，任何一个 tag 失效都是安装失败）
docker manifest inspect bitnamilegacy/postgresql:17.3.0-debian-12-r1
docker manifest inspect bitnamilegacy/clickhouse:25.2.1-debian-12-r0
docker manifest inspect bitnamilegacy/valkey:8.0.2-debian-12-r2
docker manifest inspect bitnamilegacy/minio:2024.12.18-debian-12-r1
docker manifest inspect langfuse/langfuse:3.224.1
docker manifest inspect langfuse/langfuse-worker:3.224.1
```

一个诊断小坑：macOS 没有 GNU `timeout` 命令，一开始用 `timeout 25 docker manifest inspect ...` 探测，全部误报 FAIL，排查半天才发现是 `timeout: command not found`。先确认命令本身可用，再谈网络问题。

## 安装步骤

```bash
helm repo add langfuse https://langfuse.github.io/langfuse-k8s
helm repo update
kubectl create namespace langfuse
helm install langfuse langfuse/langfuse -n langfuse --version 1.5.41 -f values.yaml
```

chart 会捆绑部署 Postgres、ClickHouse、Valkey（Redis 开源替代）、MinIO 四个子 chart，一条命令全家桶。release 名必须叫 `langfuse`（否则要改 Redis hostname）。

### values.yaml 关键配置

```yaml
langfuse:
  image:
    pullPolicy: IfNotPresent
  salt:
    value: "<openssl rand -hex 32 生成>"
  nextauth:
    url: http://localhost:3000
    secret:
      value: "<openssl rand -hex 32 生成>"
  web:
    pod:
      additionalEnv:
        - name: NODE_OPTIONS
          value: "--max-old-space-size=1536"
    resources:
      requests: {cpu: 250m, memory: 512Mi}
      limits: {cpu: "1", memory: 2Gi}
  worker:
    resources:
      requests: {cpu: 100m, memory: 256Mi}
      limits: {cpu: 500m, memory: 512Mi}

postgresql:
  auth:
    password: "<生成>"
  primary:
    resources:
      requests: {cpu: 100m, memory: 256Mi}
      limits: {cpu: 500m, memory: 512Mi}
    persistence:
      size: 5Gi

clickhouse:
  replicaCount: 1
  zookeeper:
    enabled: false
  auth:
    password: "<生成>"
  resources:
    requests: {cpu: 250m, memory: 512Mi}
    limits: {cpu: "1", memory: 1Gi}
  persistence:
    size: 5Gi

redis:
  auth:
    password: "<生成>"
  primary:
    resources:
      requests: {cpu: 50m, memory: 128Mi}
      limits: {cpu: 250m, memory: 256Mi}
    persistence:
      size: 2Gi

s3:
  auth:
    rootUser: langfuse
    rootPassword: "<生成>"
  resources:
    requests: {cpu: 100m, memory: 256Mi}
    limits: {cpu: 500m, memory: 512Mi}
  persistence:
    size: 5Gi
```

`helm template` 本地渲染验证一遍再 install，确认资源、PVC、镜像覆盖都生效。

## 四个坑

### 坑一：Bitnami 镜像全部失效

2025 年 8 月 Bitnami 注册表重组，免费镜像迁移到 `bitnamilegacy/*`，旧 `bitnami/*` tag 大量 404。我验证子 chart 默认 tag 时四个镜像全部 FAIL。好在 **chart 顶层 values 已经默认把 repository 覆盖为 `bitnamilegacy/*`**（官方防部署失败的设计），所以默认安装没问题——但如果你用的是旧版 chart 或自己覆盖了镜像，必炸。教训：装 chart 前把每个镜像 tag 都 manifest 验证一遍。

### 坑二：web 容器 Node OOM

第一次安装后，`langfuse-web` 容器反复 CrashLoopBackOff，日志最后是：

```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```

我给 web 的 limits 只设了 1Gi，Node 进程启动加载量很大（UI + API + MCP 注册），堆到 500MB 左右就撞顶。修复两件套：

```yaml
resources:
  limits: {memory: 2Gi}        # 给足容器内存
additionalEnv:
  - name: NODE_OPTIONS
    value: "--max-old-space-size=1536"   # 显式钉 Node 堆，留余量给非堆内存
```

### 坑三：ClickHouse 三副本 + zookeeper 三节点

默认 chart 会部署 **3 副本 ClickHouse + 3 节点 zookeeper**（单机 K8s 上纯属浪费，还占内存）。单实例场景压成：

```yaml
clickhouse:
  replicaCount: 1
  zookeeper:
    enabled: false
```

渲染验证 zookeeper 相关资源清零后升级，Pod 数从 9 个降到 6 个。

### 坑四：OTLP 端点路径藏匿

文档说 OTel 接入端点是 `/api/public/otel`，但部署后 POST 返回 404。从容器里挖真实路由：

```bash
kubectl exec -n langfuse deploy/langfuse-web -- sh -c \
  "grep -oE 'api/public/[a-z_/]+' /app/web/.next/routes-manifest.json | grep otel"
```

真相：v3.224.1 的 OTLP 接收端点是 **`/api/public/otel/otlp-proto/generated/root`**（OTLP protobuf 协议）。探测确认路由存活（POST 空 body 返回 500 而不是 404，说明路由存在、只是 protobuf 解析失败）。顺带发现 `/api/public/ingestion`（SDK JSON 摄入）也活着。

### 附加小坑：镜像拉取偶发 EOF

安装中 web 镜像拉取报 `short read: expected 685 bytes but got 0: unexpected EOF`——网络传输中断的偶发错误。处置：CLI 预拉镜像入本地库（`docker pull langfuse/langfuse:3.224.1`），配合 `pullPolicy: IfNotPresent`，Pod 直接复用本地镜像，不再依赖 kubelet 退避重试。

## 验证

```bash
kubectl get pods -n langfuse        # 6 个 Pod 全 Running
curl localhost:3000/api/public/health   # {"status":"OK","version":"3.224.1"}
curl -o /dev/null -w "%{http_code}" localhost:3000/   # 200
# OTLP 端点存活：POST /api/public/otel/otlp-proto/generated/root → 500（非 404）
```

访问方式：`kubectl port-forward svc/langfuse-web -n langfuse 3000:3000`，浏览器打开 `http://localhost:3000` 注册账号（首次注册即创建组织）。

## 使用方式

- **UI**：trace 详情、dashboards、数据集回归、LLM-as-Judge 评估、prompt 版本管理都在界面里
- **SDK 接入**：`pip install langfuse`，配置 `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_HOST=http://localhost:3000`
- **OTel 接入**：OTLP exporter 指向 `http://localhost:3000/api/public/otel/otlp-proto/generated/root`，带 Bearer 认证
- **升级策略**：钉 chart 版本（1.5.41），不追新；等捆绑 ClickHouse 支持 v4 后再评估迁移

## 收尾

单机 K8s 自托管 Langfuse 完全可行，最终资源占用约 3-4GB（按需启停的话平时可以 helm uninstall / scale 到 0）。最大的教训是：**生产级 Helm chart 的默认值是为高可用设计的，本地部署必须逐项核资源、核副本、核镜像**——好在这些都发生在安装前的验证和安装后的日志里，没有一个是玄学。
