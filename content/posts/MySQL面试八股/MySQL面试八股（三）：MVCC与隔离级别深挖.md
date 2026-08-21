---
title: "MySQL 面试八股（三）：MVCC 与隔离级别深挖"
date: 2026-08-21T08:00:00
categories: ["计算机基础"]
tags: ["MySQL", "面试", "八股", "MVCC", "隔离级别", "Read View"]
series: "MySQL 面试八股"
toc: true
weight: 8
ai_generated: true
---

# MySQL 面试八股（三）：MVCC 与隔离级别深挖

> 来源：面试八股资料整理（mysql的MVCC实现八股.pdf、mysql八股汇总.pdf），结合 MySQL 官方文档口径校正。
> 定位：MySQL 面试八股系列第三篇，对第二篇提到的 MVCC 做深挖。八股（二）讲了 MVCC 是什么、依赖什么、作用在哪，这一篇把 Read View 的四个字段、可见性判断的五步算法、RC 与 RR 的关键差异全部展开，并用完整时间线逐例推演到能默写的程度。这是数据库面试里追问最深的点，也最见功底。
> 收藏：本系列收录于 [后端八股复习指南](/posts/DailyDev/后端八股复习指南：博客文章索引/)。

---

## 一、快速回顾：MVCC 解决什么问题

并发事务控制只有两条路，锁与 MVCC。锁是悲观控制，默认会冲突，先加锁再访问。MVCC 是乐观控制，为每行数据维护多个版本，靠事务快照的可见性决定读到哪个版本，读写互不阻塞。

MVCC 在 InnoDB 的实现依赖三样东西：隐藏字段、Read View、undo log。隐藏字段标记每行的版本信息，undo log 保存多版本数据，Read View 决定当前事务能看到哪个版本。三者配合，实现了快速读不阻塞、并发写互不打扰的效果。

## 二、三依赖之一：隐藏字段

InnoDB 为每一行数据自动附加三个隐藏字段，这是 MVCC 的地基：

- DB_TRX_ID，6 字节，最后一次插入或更新该行的事务 ID。delete 在内部视为一次更新，只是在记录头的 deleted_flag 标记删除，所以删除也更新 DB_TRX_ID
- DB_ROLL_PTR，7 字节，回滚指针，指向该行在 undo log 里的版本链。该行从未被更新则为空
- DB_ROW_ID，6 字节，当表没有主键也没有唯一非空索引时，用这个字段生成聚簇索引

三个字段里，DB_TRX_ID 是可读性判断的主角，DB_ROLL_PTR 是版本链的导航，DB_ROW_ID 是兜底。

## 三、三依赖之二：undo log 与版本链

undo log 有两个职责：事务回滚时把数据恢复到修改前，以及为 MVCC 提供历史版本供快照读。

undo log 分两种：

- insert undo log，insert 产生的记录只对本事务可见，其他事务读不到，事务提交后即可删除，无需 purge
- update undo log，update 或 delete 产生的记录，可能还要给其他事务的 MVCC 提供历史版本，提交后不能立即删，进入历史列表等待后台 purge 线程清理

同一行被多次修改时，各次修改的 undo log 通过回滚指针穿成一条版本链。链首是最新版本，链尾是最早版本。MVCC 判断当前版本不可见时，就顺着回滚指针沿链往前找历史版本。

## 四、三依赖之三：Read View 结构与四个字段

Read View 是创建瞬间对系统事务状态的快照，里面有四个核心字段：

- m_low_limit_id，当前出现过的最大的事务 ID 加一，也就是下一个要分配的事务 ID。数据版本的 DB_TRX_ID 大于等于它，说明是快照之后才提交的修改，不可见
- m_up_limit_id，活跃事务列表 m_ids 中最小的事务 ID，m_ids 为空时等于 m_low_limit_id。数据版本的 DB_TRX_ID 小于它，说明修改在快照生成前已提交，可见
- m_ids，创建 Read View 时仍处于活跃、尚未提交的其他事务 ID 列表，不包括当前事务自己，也不包括已提交事务
- m_creator_trx_id，创建这个 Read View 的事务 ID

官方的 ReadView 类里还有 m_low_limit_no 与 m_closed 等字段，分别管 undo log 的清理时机与视图开关，面试答到四个核心字段即可，能把类结构画出来更有加分感。

## 五、可见性判断：五步算法

读取某行时，把该行最新版本的 DB_TRX_ID 与 Read View 比较，判断它对当前事务是否可见。按顺序走五步：

1. DB_TRX_ID 小于 m_up_limit_id，说明修改该行的事务在快照生成前就提交了，该版本可见
2. DB_TRX_ID 大于等于 m_low_limit_id，说明是快照生成后才有的事务改了这行，该版本不可见，跳到第 5 步
3. m_ids 为空，说明创建快照前修改该行的事务都已提交，该版本可见
4. m_up_limit_id 小于等于 DB_TRX_ID 且小于 m_low_limit_id，位于两者之间，去活跃事务列表 m_ids 里查。能在列表中找到，说明修改者尚未提交或修改发生在快照之后，不可见，跳到第 5 步；找不到则说明修改者在快照生成前已提交，可见
5. 沿 DB_ROLL_PTR 取出 undo log 里的上一个版本，用它的 DB_TRX_ID 重走第 1 步，直到找到可见版本或整个链取完

这套算法的记忆口诀：小于下限必可见，大于等于上限不可见，夹在中间查活跃列表，查不到可见，查到了沿链往前退。查到链尾仍不可见就返回空。

## 六、RC 与 RR 的关键差异：Read View 生成时机

两个隔离级别都用 MVCC 做快照读，差别只在 Read View 的生成时机：

- READ COMMITTED，每次 SELECT 都生成一个新的 Read View，活跃事务列表实时刷新
- REPEATABLE READ，只在事务第一次 SELECT 时生成一个 Read View，之后整个事务复用

生成时机不同，直接决定了不可重复读会不会发生。RC 下两次 SELECT 之间若有其他事务提交，后一次查询的活跃列表变了，能看到新数据，于是不可重复读。RR 下 Read View 从头到尾不变，其他事务提交与否都影响不到后续读取，于是可重复读。

下面用一个完整例子把这条差异推演到极致。数据行 id=1 的 name 字段初始为「菜花」，事务 1（ID 101）、事务 2（ID 102）先后在 T1、T2 修改它并保持未提交，事务 3（ID 103）在 T4 开始查询。版本链上记录的 DB_TRX_ID 依次为 102、101、最老的 1。

### RC 级别下

T4 第一次查询，生成 Read View，m_ids 为 [101, 102]，m_low_limit_id 为 104，m_up_limit_id 为 101。最新版本 DB_TRX_ID 为 101，位于 101 与 104 之间，去 m_ids 查，能找到 101，不可见。沿回滚指针取上一版本，DB_TRX_ID 仍是 101，不可见。再往前取到 DB_TRX_ID 为 1，小于 m_up_limit_id，可见。事务 3 读到「菜花」。

T6 事务 101 已提交、102 未提交，事务 3 再次 SELECT，RC 下生成新 Read View，m_ids 变为 [102]。最新版本 DB_TRX_ID 为 102，仍夹在区间里，能在 [102] 里找到，不可见，沿链退到 DB_TRX_ID 101，小于 m_up_limit_id，可见。事务 3 这次读到「李四」，与 T4 结果不同，不可重复读。

T9 事务 101、102 都已提交，再生成新 Read View，m_ids 为空，m_up_limit_id 等于 m_low_limit_id 为 104。最新版本 DB_TRX_ID 102 小于 104，可见。事务 3 读到「赵六」。三次查询三个结果，RC 的不可重复读演示完毕。

### RR 级别下

T4 第一次查询生成 Read View 后，m_ids 为 [101, 102] 并保持整个事务不变。T4 的读取流程与 RC 完全一致，读到「菜花」。

T6 事务 101 已提交、最新版本变成 DB_TRX_ID 102，但 RR 下沿用旧 Read View，m_ids 还是 [101, 102]。最新版本 102 夹在区间里，能在旧列表中找到，不可见。沿链退到 101，同样能在旧列表中找到，不可见。再退到 DB_TRX_ID 1，小于 m_up_limit_id，可见。事务 3 仍读到「菜花」。

T9 沿用同一个 Read View，两个事务仍排在 m_ids 里，整个版本链对事务 3 都不可见，一路退到最老的 DB_TRX_ID 1，仍读到「菜花」。事务 3 三次查询结果始终一致，RR 的可重复读成立。

对照两张推演就能看清：同样三笔修改，RC 每次重看世界，RR 只看第一次抬眼时的那一帧。

## 七、MVCC 与 Next-Key Lock 联合防幻读

幻读的本质是两次查询之间其他事务插入了新行，结果集变多。快照读和当前读面对幻读的态度不同。

快照读（普通 SELECT）在 RR 下复用第一次生成的 Read View，快照生成之后插入的新行版本，事务根本看不见，自然没有幻读。

当前读（SELECT ... FOR UPDATE、LOCK IN SHARE MODE、INSERT、UPDATE、DELETE）每次读最新数据，快照挡不住它。此时靠 Next-Key Lock 防幻读。Next-Key Lock 是记录锁加间隙锁，既锁已存在的记录，也锁记录之间的间隙，其他事务无法在锁定范围内插入新行。只要插不进来，就不会多出幻影行。

一句话收束：快照读靠 Read View 挡住看不到的新行，当前读靠 Next-Key Lock 挡住插不进的新行。这就是 InnoDB 在 RR 级别下把标准定义的四档问题也基本解决掉的完整机制，也是面试官最想听你讲清楚的一段。

## 八、与前面知识点的串联

把整个 InnoDB 并发侧串起来看：普通 SELECT 走快照读，靠隐藏字段加 undo 版本链加 Read View 判断可见性，RR 下复用一次 Read View 实现可重复读并防住快照读的幻读。SELECT ... FOR UPDATE 这类当前读走锁，RR 下默认加临键锁锁住记录与间隙防住当前读的幻读。undo log 同时支撑回滚与多版本，redo log 保证已提交数据不丢，binlog 保障主从一致，两阶段提交把 redo 与 binlog 对齐。全局的并发与可靠性拼图在这一篇补齐。

---

## 小结

本篇把 MVCC 从「知道」推向「能默写」。三依赖记住隐藏字段、Read View、undo log 的角色分工。Read View 四字段里，m_up_limit_id 与 m_low_limit_id 是可见性判断的上下界，m_ids 是活跃事务清单，m_creator_trx_id 是视图主人的身份证。五步可见性算法按「小于下限可见、大于等于上限不可见、夹在中间查清单」推进，查不到就在版本链上往前退。RC 与 RR 的唯一差别是 Read View 的生成时机，后者因此实现了可重复读。最后用 Next-Key Lock 补上当前读的幻读防线，与快照读的 Read View 防线合成完整闭环。

下一篇 MySQL 面试八股（四）讲三类日志：redo log 的 WAL 与刷盘、binlog 的三种格式、两阶段提交与崩溃恢复，把可靠性的另一半拼齐。
