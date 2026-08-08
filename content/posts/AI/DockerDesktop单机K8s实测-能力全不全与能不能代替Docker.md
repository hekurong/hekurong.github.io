---
title: "Docker Desktop 单机 K8s 实测：能力全不全，能不能代替 Docker"
date: 2026-08-08
draft: false
categories: ["AI"]
tags: ["Kubernetes", "Docker Desktop", "kind", "DevOps", "单机部署", "LLMObservability"]
description: "实测 Docker Desktop 内置 Kubernetes 的完整能力清单：组件、存储、缺什么、官方边界，以及一个关键结论——K8s 能代替 docker compose，但不能代替 Docker 本身。"
toc: true
ai_generated: true
---

## 缘起

给多 Agent 项目搭本地基础设施（评估平台、可观测栈）时，我一直在纠结一个问题：这些服务到底跑在 Docker Compose 上，还是全部统一跑在 K8s 上？于是花了半天把 Docker Desktop 自带的 K8s 从头到尾摸了一遍——本文是实测记录，全部结论来自本机命令输出和官方文档核实。

## 现状盘点

我的环境：macOS（Apple Silicon），Docker Desktop 29.6.2，内置 Kubernetes 1.36.1。

```bash
$ kubectl get nodes -o wide
NAME                    STATUS   ROLES           VERSION    INTERNAL-IP   OS-IMAGE
desktop-control-plane   Ready    control-plane   v1.36.1    172.18.0.4    Debian GNU/Linux 13 (trixie)
```

单节点 control-plane，containerd 运行时。控制面组件一个不少：

```bash
$ kubectl get pods -n kube-system
coredns-* ×2                Running
etcd-desktop-control-plane  Running
kindnet-*                   Running
kube-apiserver-*            Running
kube-controller-manager-*   Running
kube-proxy-*                Running
kube-scheduler-*            Running
```

存储已经就位：local-path StorageClass（`hostpath` 和 `standard` 两个，默认即 local-path），Pod 里声明 PVC 就能动态供给。

### 有什么、缺什么

| 能力 | 现状 |
|---|---|
| 控制面全套 | ✅ apiserver / etcd / scheduler / controller-manager / coredns / kindnet / kube-proxy |
| 存储（PVC） | ✅ local-path StorageClass（动态供给，hostpath 落盘） |
| 镜像互通 | ✅ docker build 的镜像 K8s 节点直接可见（默认 Docker image store 下成立） |
| Ingress | ❌ 无 IngressClass，需自装 ingress-nginx/traefik，或用 port-forward/NodePort 兜底 |
| metrics-server | ❌ kubectl top 报 Metrics API not available（HPA 不可用，可后装） |
| LoadBalancer | ❌ 无现成 LB 实现（访问走 port-forward 足够） |
| 资源 | CPU 10 核 / 内存 8.1Gi 可用 |

## 官方能力边界

Docker Desktop 4.51+ 支持 kubeadm / kind 两种集群 provisioner。我当前的是 kind 系——它支持**多节点**（可建 worker 节点模拟真实环境）、可选手 K8s 版本、支持 ECI（增强容器隔离）。kubeadm 是旧方案，单节点、不能选版本、provision 更慢。

也就是说：以后想模拟双节点，Dashboard 里重建集群即可，不用换工具链。

## 能不能代替 Docker？

先给结论：**K8s 不能代替 Docker，但能代替 docker compose。**

原因很朴素——Docker Desktop 的 K8s 集群本身就是跑在 Docker 的 VM 里的容器（kind 节点就是容器）。K8s 依赖 Docker engine 提供地基，它代替的是**编排层**（compose 的活），不是**容器运行时层**。

代替 compose 到什么程度？Deployment / StatefulSet / Service / ConfigMap / Secret / PVC / Job / CronJob 全部可用——我在这个集群上装了 Langfuse（Postgres + ClickHouse + Valkey + MinIO 全家桶），无任何功能缺失。缺的 Ingress 和 metrics-server 都是增强件，可以自装，也可以不用（port-forward 访问 UI、不用 HPA）。

一个容易忽略的好处：**镜像互通**。docker build 的镜像 K8s 直接可见，配 `imagePullPolicy: IfNotPresent` 或 `Never` 后，开发迭代不需要推镜像仓库。实际部署中我还用了一招：某个镜像偶发拉取 EOF 失败时，CLI `docker pull` 预拉进本地库，Pod 重启直接复用，绕开 kubelet 退避重试。

## 资源账是唯一的硬约束

8.1Gi 可用内存。一个 Langfuse 全家桶就要 3.7Gi（web 2Gi + ClickHouse 1Gi + 其余），再叠加业务服务（Neo4j 约 1G + 向量模型 1G + 五个 Agent 约 2.5G）直接超支。所以单机 K8s 的玩法铁律是**按需启停**：跑评估观察时起基础设施，平时停掉；给每个工作负载写死 requests/limits，绝不裸奔。

## 对本地基础设施部署的影响

既然 K8s 全权接管编排，基础设施（Langfuse / Opik / Jaeger 这类）就不用再起一套 Docker Compose 了——官方 Helm chart 直接 `helm install` 进同一个集群，与业务统一管理。访问走 `kubectl port-forward`，跟官方文档的用法一致。

## 收尾

Docker Desktop 自带的 K8s 对本地开发来说是完整的单节点集群，核心 API 一应俱全，缺的只是增强件。它不是"另一个 Docker"，而是"Docker 之上的编排层"——理解了这层关系，本地基础设施的部署形态就清晰了：**docker 负责 build，K8s 负责 run**，各司其职。
