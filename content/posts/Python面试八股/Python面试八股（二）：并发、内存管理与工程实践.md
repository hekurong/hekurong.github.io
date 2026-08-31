---
title: "Python 面试八股（二）：并发、内存管理与工程实践"
date: 2026-08-31T21:04:00
categories: ["计算机基础"]
tags: ["Python", "面试", "八股", "GIL", "asyncio", "多进程", "垃圾回收"]
series: "Python 面试八股"
toc: true
weight: 10
ai_generated: true
description: "从 GIL 的边界、线程与协程选型到 CPython 的引用计数、循环垃圾回收和资源治理，梳理 Python 运行时高频题。"
---

# Python 面试八股（二）：并发、内存管理与工程实践

> 来源：依据 Python 3 官方语言参考与标准库文档整理，代码示例按 Python 3.9+ 语法验证。
> 定位：上篇讲对象、容器与函数，本篇进入 Python 技术面最容易被追问的运行时部分。重点不在背模块名，而在能按工作负载选对线程、协程或进程，并把 GIL、垃圾回收与资源释放的边界说清。
> 收藏：本系列收录于 [后端八股复习指南](/posts/DailyDev/后端八股复习指南：博客文章索引/)。

---

## 一、先把 GIL 的口径说准确

### 1. GIL 限制的究竟是什么

传统 GIL 启用的 CPython 中，同一进程内同一时刻只有一个线程执行 Python 字节码。因此，纯 Python 的 CPU 密集型任务，靠不断增加线程通常不能得到线性多核加速。

这句话有三个边界，分别如下。

- 这是 **CPython 的实现细节**，不是 Python 语言规范对所有解释器的绝对限制。
- GIL 不等于线程安全。多步读改写、跨对象不变量、业务顺序仍然会产生竞争，需要锁或消息队列保护。
- GIL 不等于线程没有价值。线程在文件、网络、数据库等 I/O 等待期间仍能让其他任务推进，许多 C 扩展也可能在耗时计算时释放 GIL。

Python 3.13 起，CPython 提供可选的 free-threaded 构建，可关闭 GIL 并让线程真正并行执行。它不是默认构建，且部分三方扩展导入后会重新启用 GIL。面试中不要把 Python 完全不能利用多核当成定论，先说明解释器、版本和构建方式，再讨论方案。

### 2. 一张表选线程、协程和进程

| 工作负载 | 优先选择 | 核心理由 | 主要代价 |
|----------|----------|----------|----------|
| 大量可等待的网络或磁盘 I/O | `asyncio` | 单线程事件循环可管理很多等待中的任务 | 依赖链必须尽量使用异步接口，阻塞调用会卡住事件循环 |
| 已有同步 I/O 库，任务量中等 | 线程池 | 改造成本低，线程共享进程内对象 | 共享状态要同步，传统 CPython 不适合纯 Python CPU 并行 |
| 纯 Python 的 CPU 密集计算 | 进程池或 `multiprocessing` | 独立进程绕开传统 GIL，可用多核 | 进程启动、序列化和进程间通信都有成本 |
| 原生扩展已释放 GIL 的计算任务 | 线程或库自身并行能力 | 性能关键代码不一定受 Python 字节码执行限制 | 必须查清该库的线程模型和数据安全边界 |

高质量回答不是背出三个模块，而是先问任务在等 I/O 还是在烧 CPU，再说明共享内存与序列化成本，最后给出选型。

---

## 二、线程与同步

### 1. 线程适合 I/O，不代表可以不管并发安全

`threading` 的线程共享同一进程内存，传递对象方便，但也意味着共享状态容易被同时修改。对共享余额、计数器、连接池状态等，使用同步原语表达临界区，而不是依赖 GIL 或某个容器当前碰巧的内部实现。

```python
from threading import Lock

balance = 0
lock = Lock()

def deposit(amount):
    global balance
    with lock:
        balance += amount
```

`with lock` 的价值不只是语法短。无论代码块正常结束还是抛异常，锁都会被释放，避免异常路径把其他线程永久卡住。

### 2. 常见同步工具怎么答

| 工具 | 解决的问题 | 使用提醒 |
|------|------------|----------|
| `Lock` | 最基础的互斥访问 | 同一线程重复获取会死锁，不要持锁做慢 I/O |
| `RLock` | 同一线程需要嵌套进入同一临界区 | 不是性能优化工具，只在重入语义确有必要时使用 |
| `Condition` | 等待某个状态成立 | `wait()` 要放在条件循环中，防止虚假唤醒或状态变化 |
| `Semaphore` | 限制并发资源数 | 常用于连接数、下载数和外部 API 并发额度 |
| `queue.Queue` | 在线程间安全传递任务 | 生产消费模型优先传消息，少共享可变状态 |

锁粒度要围绕不变量划定。锁太大，吞吐下降；锁太小，状态可能只更新一半。跨多个锁时固定获取顺序，并给外部调用设超时，才能降低死锁概率。

### 3. 为什么 GIL 也挡不住竞态

考虑余额增加这种逻辑，语义上包含读取旧值、计算新值、写回新值三步。即使某些单个字节码操作在特定 CPython 版本看起来连续，也不能把多步业务操作当作原子操作。换解释器、换版本、调用 C 扩展、引入 I/O 后，偶然成立的假设都可能失效。

面试回答可直接说：**GIL 管解释器内部的执行协调，不替业务代码维护事务语义。共享状态仍用 Lock、Queue、数据库事务或消息化模型来保护。**

---

## 三、asyncio 的核心不是异步语法，而是协作调度

### 1. 协程如何切换

`asyncio` 通过事件循环调度协程任务。协程运行到 `await` 一个尚未就绪的 awaitable 时主动让出执行权，事件循环再去运行其他就绪任务。它实现的是并发组织，不会凭空把 CPU 密集型 Python 代码并行化。

```python
import asyncio

async def fetch(name):
    await asyncio.sleep(0)
    return f'{name}: done'

async def main():
    tasks = [fetch(name) for name in ['a', 'b', 'c']]
    return await asyncio.gather(*tasks)

assert asyncio.run(main()) == ['a: done', 'b: done', 'c: done']
```

`asyncio.gather()` 是并发等待一组协程，不是按列表顺序串行等待。返回结果仍与传入任务顺序对应，因此业务代码无需依赖完成先后推断结果位置。

### 2. 最常见的阻塞坑

在协程里直接调用 `time.sleep()`、同步 HTTP 客户端、长时间 JSON 编解码或 CPU 循环，会占住事件循环，其他协程无法运行。已有同步函数不能立刻重写时，可以把阻塞工作移到线程：

```python
import asyncio
import time

def blocking_work():
    time.sleep(0.01)
    return 'done'

async def main():
    return await asyncio.to_thread(blocking_work)

assert asyncio.run(main()) == 'done'
```

`to_thread` 解决的是不阻塞事件循环，不会让传统 GIL 构建中的纯 Python CPU 任务自动多核并行。CPU 重任务仍要评估进程池或原生计算库。

### 3. 取消与超时为什么要主动设计

协程取消是协作式的，通常在下一个可取消的 `await` 处生效。请求链路要传入超时或取消信号，资源申请后用 `try/finally` 清理。吞掉取消异常、创建任务后从不等待结果、把后台任务无限堆积，都会让服务在压力下逐渐失控。

一句话记忆：**异步不是不用等，而是等待时把执行权交回事件循环。**

---

## 四、进程与进程池

### 1. 进程为什么能处理 CPU 密集任务

`multiprocessing` 用独立子进程执行任务，每个进程有自己的解释器状态与地址空间，因此能绕开传统 GIL 的限制。代价是对象不能像线程中那样直接共享，任务参数和返回值通常需要通过管道、队列或序列化传递。

```python
from concurrent.futures import ProcessPoolExecutor

def square(value):
    return value * value

if __name__ == '__main__':
    with ProcessPoolExecutor() as pool:
        result = list(pool.map(square, [1, 2, 3, 4]))
    assert result == [1, 4, 9, 16]
```

进程入口必须放在 `if __name__ == '__main__':` 保护下。子进程在某些启动方式下会重新导入主模块，缺少这个保护会递归创建子进程或报启动错误。

### 2. 进程池的三个现实成本

- **启动成本**。进程远比协程和线程重，短小任务可能还没开始算就把时间花在调度上。
- **数据传输成本**。大对象在进程间传递需要序列化与复制，传输成本可能高过计算本身。
- **可序列化约束**。任务函数应定义在模块顶层，局部函数、lambda、打开的文件对象等常常不能作为进程任务安全传递。

所以 CPU 密集不等于见到循环就多进程。先做性能剖析，确认瓶颈确实在计算，再用足够粗粒度的任务换取并行收益。

---

## 五、内存管理与垃圾回收

### 1. Python 的 GC 也要分实现说

Python 语言只要求不可达对象不能再被当作可用对象访问，并不规定具体回收算法。CPython 当前以**引用计数**为主，再由循环垃圾收集器补充处理循环引用；其他解释器可以采用不同策略。

```python
import gc

left = []
right = []
left.append(right)
right.append(left)

assert gc.isenabled()
```

`left` 和 `right` 互相引用时，单纯引用计数不会归零，因此需要循环垃圾收集器发现这类不可达环。不要为了所谓性能长期关闭 GC，除非已经确认程序不会制造循环引用，并且有基准测试证明收益值得。

### 2. 为什么资源不能交给 `__del__`

文件句柄、Socket、锁、数据库连接等都对应进程外资源。对象何时不可达、垃圾回收何时发生都不应成为释放资源的依据。Python 官方文档明确建议显式关闭资源，并通过 `with` 或 `try/finally` 固化清理路径。

```python
with open('records.log', 'w', encoding='utf-8') as file:
    file.write('saved\n')
```

`with` 块即使出现异常也会调用上下文管理器的退出逻辑。`__del__` 的执行时机难以预测，里面的异常会被忽略，还可能在任意线程执行代码时触发并造成死锁风险。资源治理优先选择上下文管理器，不把析构函数当业务收尾钩子。

### 3. 常见内存泄漏从哪里来

| 类型 | 典型原因 | 排查与治理 |
|------|----------|------------|
| 强引用长期存活 | 全局列表、无上限缓存、监听器未注销 | 给缓存设大小或过期策略，明确注销订阅 |
| 循环与回调链 | 对象互相引用，回调闭包把大对象带入长期任务 | 缩短引用链，必要时用 `weakref` |
| 异步任务堆积 | 创建任务后不等待、不取消，连接与响应未关闭 | 设置超时、限流、在 finally 中收尾 |
| 外部资源泄漏 | 文件、连接、锁未释放 | 全部改为 `with` 或显式 `close()` |

弱引用适合缓存或观察者关系：缓存不应因为保存过某个对象就独占其生命周期。但弱引用指向的对象可能随时消失，取值后必须处理对象已被回收的情况。

### 4. 排查时不要只看进程占用

内存升高不必然是泄漏，也可能是缓存、分配器保留或负载增长。排查应先定义增长是否持续、对象数量是否持续增加，再用 `tracemalloc` 比较快照、用 `gc` 的调试能力检查异常引用链。发现问题后回到拥有关系，问清是谁还持有对象，为什么这个引用不该在任务结束后释放。

---

## 六、异常、上下文与类型标注

### 1. `try/except/else/finally` 各管什么

- `try` 放可能失败的最小代码块。
- `except` 捕获可预期的具体异常，不用裸 `except` 吞掉编程错误和退出信号。
- `else` 只在没有异常时运行，适合把成功路径与异常处理分开。
- `finally` 无论是否异常都会运行，适合做必须执行的清理。

```python
def parse_port(text):
    try:
        port = int(text)
    except ValueError as exc:
        raise ValueError('端口必须是整数') from exc
    else:
        if not 0 < port < 65536:
            raise ValueError('端口超出有效范围')
        return port

assert parse_port('8080') == 8080
```

`raise ... from exc` 保留异常因果链，日志里能同时看到底层失败和业务层语义，比直接重抛更利于排障。

### 2. 类型标注解决什么，不解决什么

类型标注能表达函数边界，配合静态检查器、IDE 和测试提升可维护性。示例如下。

```python
def merge_tags(left, right):
    return left + right
```

默认 Python 解释器不会因为标注而在运行时阻止错误类型传入。它主要服务于静态分析与协作，不应被误说成编译期强制类型系统。关键的外部输入校验，仍应在运行时明确完成。

---

## 七、面试答题总纲

| 题目 | 先给结论 | 再补边界与取舍 |
|------|----------|----------------|
| GIL 是什么 | 传统 GIL CPython 中同一时刻一个线程执行 Python 字节码 | 是 CPython 细节，I/O 线程仍有价值，3.13+ 有可选 free-threaded 构建 |
| CPU 密集怎么并行 | 优先进程池或释放 GIL 的原生库 | 评估启动、序列化与数据传输成本 |
| `asyncio` 为什么高并发 | 等待 I/O 时协作让出事件循环 | 阻塞调用会卡住全局事件循环，CPU 重活不能直接解决 |
| GIL 能保证线程安全吗 | 不能 | 业务临界区仍要 Lock、Queue、事务或消息模型保护 |
| Python 怎么回收内存 | CPython 引用计数为主，循环 GC 补充 | 是实现细节，外部资源要显式关闭 |
| `__del__` 能关文件吗 | 不应依赖 | 时机不确定，`with` 和 `finally` 才是可靠收尾 |

---

## 小结

Python 运行时题的核心不是把线程、协程、进程背成三套 API。先按 I/O 或 CPU 判断负载，再按共享内存、延迟、数据传输成本做取舍，方案自然会清楚。GIL 要限定在传统 CPython 的语境下讨论，线程安全要落到业务不变量而不是碰运气。内存管理也一样，引用计数和循环 GC 负责对象，`with`、超时、取消和资源边界才负责让服务长期稳定运行。两篇合起来，已经覆盖 Python 技术面从语言机制到运行时选型的主干问题。

## 参考资料

- [Python threading：线程并行与 GIL 边界](https://docs.python.org/3/library/threading.html#gil-and-performance-considerations)
- [Python asyncio：异步 I/O](https://docs.python.org/3/library/asyncio.html)
- [Python multiprocessing：进程并行](https://docs.python.org/3/library/multiprocessing.html)
- [Python gc：循环垃圾收集接口](https://docs.python.org/3/library/gc.html)
- [Python support for free threading](https://docs.python.org/3/howto/free-threading-python.html)
- [Python 语言参考：数据模型与资源释放](https://docs.python.org/3/reference/datamodel.html)
