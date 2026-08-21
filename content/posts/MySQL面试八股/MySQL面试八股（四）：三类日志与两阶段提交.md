---
title: "MySQL 面试八股（四）：三类日志与两阶段提交"
date: 2026-08-21T07:00:00
categories: ["计算机基础"]
tags: ["MySQL", "面试", "八股", "redo log", "binlog", "undo log", "两阶段提交"]
series: "MySQL 面试八股"
toc: true
weight: 6
ai_generated: true
---

# MySQL 面试八股（四）：三类日志与两阶段提交

> 来源：面试八股资料整理（mysql日志八股.pdf、mysql八股汇总.pdf、mysql中sql语句执行过程.pdf），结合 MySQL 官方文档口径校正。
> 定位：MySQL 面试八股系列第四篇，对第二篇日志一节做深挖。第二篇讲了三类日志各管什么，这一篇把 redo log 的 WAL 思路与刷盘时机、binlog 的三种格式与写入机制、undo log 的两种类型、两阶段提交与崩溃恢复的完整判断逻辑全部展开，并补上主从复制与日志的关系。这是数据库可靠性的另一半拼图，也是「为什么这么设计」最常被追问的一篇。
> 收藏：本系列收录于 [后端八股复习指南](/posts/DailyDev/后端八股复习指南：博客文章索引/)。

---

## 一、日志总览

MySQL 日志包括错误日志、查询日志、慢查询日志、事务日志与二进制日志。面试的重点集中在三类事务相关日志：

- redo log，重做日志，InnoDB 引擎独有，物理日志，保证崩溃恢复与持久性
- binlog，归档日志，Server 层通用，逻辑日志，保证主从一致与数据备份
- undo log，回滚日志，逻辑日志，保证回滚与 MVCC 多版本

三者的职责一句话：redo 保本地不丢，binlog 保集群一致，undo 保回滚与旧版本。下面逐个深挖。

## 二、redo log：WAL 的核心

### 1. 为什么需要它：直接刷数据页太慢

InnoDB 以页为单位管理数据，一页 16KB。更新数据时，理想做法是把修改后的数据页刷回磁盘，但问题在于，一条 update 可能只改了页里的几个字节，却要把整页 16KB 刷盘。而且数据页在盘上的位置是随机分布，刷整页是随机写，性能极差。

redo log 破解了这道题。它只记录「在某个数据页上做了什么修改」，一条记录通常只有几十字节，包括表空间号、数据页号、偏移量、修改长度与具体修改内容，而且是顺序写。先写几十字节的顺序日志，再异步把脏页合并刷盘，性能远超直接刷整页。

这就是 WAL（Write-Ahead Logging，预写式日志）的核心思想：先写日志，再落数据。日志先落盘，数据可以慢慢合并，崩溃了靠日志恢复。理想情况下事务提交即刷盘，实际刷盘时机由策略决定。

### 2. 刷盘时机

redo log 先写进内存的 redo log buffer，再刷到磁盘文件。刷盘发生在几种情况下：

- 事务提交时刷盘，由 innodb_flush_log_at_trx_commit 控制
- log buffer 写满约一半时，后台主动刷盘
- 检查点执行时，脏页刷盘伴随 redo log 刷盘
- 后台线程每 1 秒定期刷盘
- MySQL 正常关闭时全部刷盘

因为后台线程每秒刷一次盘，一个还没提交的事务的 redo log 也可能被刷到磁盘。这部分日志在崩溃后没有对应的事务，恢复时自然丢弃。

### 3. 刷盘策略：innodb_flush_log_at_trx_commit 三值

提交时刷不刷、刷到什么程度，由这个参数控制：

- 0，每次事务提交不主动刷盘，性能最高，但 MySQL 崩溃可能丢最近一秒的事务
- 1，每次提交都刷盘，性能最低但绝不丢数据，默认值
- 2，每次提交只把 redo log 写入文件系统缓存 page cache，MySQL 进程崩溃不丢，机器宕机可能丢一秒

参数默认是 1，只有设为 1 才能保证事务提交后 redo log 一定在磁盘上。生产环境为保事务持久性，通常保持默认 1。

### 4. 存储形式：环形日志文件组

redo log 以文件组的形式存在于磁盘，每个文件大小相同，采用环形数组循环写入。文件组里有两个位置指针：

- write pos，当前写到的位置，写一条前移一次
- checkpoint，当前要擦除的位置，恢复加载过的日志后前移

write pos 与 checkpoint 之间是还能写入的区域。当 write pos 追上 checkpoint，说明日志文件组写满，必须先推进 checkpoint 腾出空间，MySQL 因此短暂暂停写入。两端会「互相追赶」，正是环形结构的特点。

MySQL 8.0.30 起，日志文件组的配置有变化。innodb_log_files_in_group 与 innodb_log_file_size 两个参数被废弃，改用 innodb_redo_log_capacity 指定总容量，文件数固定为 32，每个文件大小是总容量除以 32。配置新版本时用新参数即可。

## 三、binlog：Server 层的归档日志

### 1. 定位与作用

binlog 是逻辑日志，记录语句的原始逻辑，例如「给 id=2 这行的 c 字段加 1」。它在 Server 层，无论哪种存储引擎，只要发生了表数据更新都会产生。数据备份、主备、主从同步都靠它保证一致性。binlog 是顺序写。

### 2. 三种记录格式

由 binlog_format 参数指定：

- statement，记录 SQL 语句原文，从库直接重放。但遇到 now()、随机数这类非确定性函数，重放结果与原库不一致
- row，记录具体行的变更数据，信息最准确、主从不失真，但占用空间大、同步更耗 IO。row 格式记录的详细内容需用 mysqlbinlog 工具解析
- mixed，两者混合，MySQL 判断语句是否可能引起不一致，可能就用 row，否则 statement

实践上通常直接用 row，为数据恢复与同步带来更可靠的保障。

### 3. 写入机制

事务执行过程中，binlog 先写进每个线程私有的 binlog cache，事务提交时才统一写入 binlog 文件。因为一个事务的 binlog 不能被拆开，无论多大都要一次性写入。binlog_cache_size 控制单个线程 cache 大小，超过则暂存到磁盘。

写入分两步：write 把日志写到文件系统缓存 page cache，速度快但不持久化；fsync 才真正落盘。两者时机由 sync_binlog 控制，默认 1：

- 0，每次提交只 write，由系统决定何时 fsync，性能好但宕机可能丢日志
- 1，每次提交都 fsync，最安全
- N，每次提交都 write，攒够 N 个事务再 fsync，IO 瓶颈场景可调大 N 权衡性能与丢失风险

## 四、两阶段提交：让两份日志对齐

redo log 与 binlog 侧重点不同，写入时机也不同。redo 在事务执行过程中持续写，binlog 只在提交时写。若两者各写各的，中间宕机就会不一致。

试想 update T set c=1 where id=2，假设先写完 redo log 后、binlog 还在写的时候崩溃。binlog 里没有这次修改，之后用 binlog 恢复的从库和备份少这条更新，而这台机器靠 redo log 恢复了，两边对不上。

两阶段提交把 redo log 的写入拆成 prepare 与 commit 两步。流程是：先写 redo log 到 prepare 状态，再写 binlog，最后把 redo log 改为 commit 状态。崩溃恢复时的判断逻辑：

- redo log 处于 prepare 且没有对应的 binlog，事务回滚。因为 binlog 没写，本地恢复完成后主从不一致，宁可回滚
- redo log 处于 prepare 但能找到完整的 binlog，事务补完提交。因为 binlog 已写完，说明两阶段都走完，重放 binlog 能对齐

- 若 redo log 已是 commit 状态，直接按已提交处理

关键在崩溃恢复时查 binlog 存在与否：binlog 缺失则回滚，binlog 齐全则提交。这样无论在哪一步宕机，两份日志的最终状态都能对齐。

这套两阶段设计的历史原因也值得一提：MySQL 最初只有自带的 MyISAM，而后 InnoDB 以插件形式接入，redo log 是引擎自带的 crash-safe 能力，binlog 是 Server 层通用的归档日志，两者由来不同，才需要两阶段提交在衔接处兜底。

## 五、undo log：回滚与多版本的支柱

undo log 是逻辑日志，主要两个作用：一是事务回滚时把数据恢复到修改前，二是配合 MVCC 记录历史版本供快照读。

事务执行 DELETE，undo log 就记录对应的 INSERT；执行 UPDATE，就记录修改前的旧值。回滚时倒着重放 undo 即可。undo log 自身也要持久化，因此它的信息同样会写进 redo log。

undo log 分两种：

- insert undo log，insert 产生的记录只对本事务可见，事务提交后即可删除，无需 purge
- update undo log，update 或 delete 产生的记录可能还要给 MVCC 提供历史版本，提交后不能立即删，进入历史列表 waiting purge 线程清理

同一行被多个事务或同一事务多次修改时，这些版本的 undo log 由行内回滚指针串成版本链。链首是最新版本，链尾是最早版本。MVCC 就沿着这条链判断可见性。这部分在前面 MVCC 篇已详细展开，本篇与上篇互为印证。

## 六、主从复制：binlog 的用武之地

主从复制的载体就是 binlog。常规异步复制中，主库提交后从库拉取 binlog 回放，存在主从延迟。半同步复制要求至少一个从库确认收到 binlog 才算提交成功，显著缩小延迟窗口。生产通常读写分离加半同步，配合 GTID 标记事务保证主从位点一致。

从库读到旧数据的排查，通常就是往 binlog 回放与主从延迟这个方向查。三个线程参与复制：主库的 binlog 线程把数据更改写入 binlog，从库的 I/O 线程拉取 binlog 写入中继日志 relay log，从库的 SQL 线程读取 relay log 并在从库重放。

## 七、与前面知识点的串联

整套可靠性拼图在本篇补齐。redo log 用 WAL 和环形文件组保证已提交事务不丢，undo log 支撑回滚与多版本，binlog 保障主从一致与备份。两阶段提交把 redo 与 binlog 对齐，崩溃恢复时靠 binlog 是否存在判断回滚或补交。三者与 MVCC 的 Read View、Next-Key Lock 一起，构成 InnoDB 并发与可靠性的完整闭环。

---

## 小结

本篇把可靠性的三根柱子讲透。redo log 是物理日志，解决「直接刷数据页太慢」的痛点，靠 WAL 思路做到先写日志再落数据，刷盘策略三选一，环形文件组靠 write pos 与 checkpoint 循环周转。binlog 是逻辑日志，三种格式里 row 最可靠，write 与 fsync 分离让性能与安全可权衡。undo log 分 insert 与 update 两类，前者即用即弃，后者等 purge 清理。两阶段提交把 redo 拆成 prepare 与 commit，崩溃恢复时 binlog 存在与否决定回滚或补交。主从复制以 binlog 为载体，配合半同步与 GTID 保障集群一致。

至此，MySQL 面试八股四篇全部收齐：架构与索引管查询侧，事务锁日志与 MVCC 管写入与并发侧。配合 SQL 优化实战系列三篇，从原理到执行计划到手写 SQL，MySQL 方向的一条线是完整的。
