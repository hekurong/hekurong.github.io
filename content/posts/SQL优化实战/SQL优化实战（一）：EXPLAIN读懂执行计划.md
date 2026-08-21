---
title: "SQL 优化实战（一）：EXPLAIN 读懂执行计划"
date: 2026-08-21T11:00:00
categories: ["计算机基础"]
tags: ["MySQL", "面试", "八股", "SQL优化", "EXPLAIN", "执行计划"]
series: "SQL 优化实战"
toc: true
weight: 30
ai_generated: true
---

# SQL 优化实战（一）：EXPLAIN 读懂执行计划

> 来源：面试八股资料整理（mysql索引八股.pdf、mysql八股汇总.pdf），结合 MySQL 官方文档口径校正。
> 定位：SQL 优化实战系列第一篇。SQL 优化要先会诊断，EXPLAIN 就是那张诊断单。这一篇把执行计划每个字段讲透，配真实案例手推，看完能自己给一条慢 SQL 开方子。下一篇讲慢 SQL 定位与索引优化。
> 收藏：本系列收录于 [后端八股复习指南](/posts/DailyDev/后端八股复习指南：博客文章索引/)。

---

## 一、为什么先学 EXPLAIN

面试里常被问「你怎么优化一条慢 SQL」，答案的起点几乎都是 EXPLAIN。它不是真的执行语句，而是让查询优化器分析这条 SQL，给出它认为最优的执行方案，再把方案打印出来。正是这个「不真执行」的属性，让它成了线上排查的保命工具，随便哪条语句都能安全地 EXPLAIN 一把，不会产生数据变更。

执行计划就是优化器给出的执行方式，关键看三件事：访问方式（type）、用了哪个索引（key）、额外做了什么（Extra）。看懂这三列，一条 SQL 是快是慢、卡在哪个环节，基本一目了然。

EXPLAIN 的通用格式：

```sql
EXPLAIN SELECT 字段 FROM 表 WHERE 条件;
```

## 二、EXPLAIN 输出长什么样

用一条对 100 万行排序的语句演示，先不建索引：

```sql
EXPLAIN SELECT score, name FROM cus_order ORDER BY score DESC;
```

输出形如：

| id | select_type | table | partitions | type | possible_keys | key | key_len | ref | rows | filtered | Extra |
|----|-------------|-------|------------|------|---------------|-----|---------|-----|------|----------|-------|
| 1 | SIMPLE | cus_order | NULL | ALL | NULL | NULL | NULL | NULL | 997572 | 100.00 | Using filesort |

这一行的信息量已经很大：type 是 ALL，说明全表扫描；rows 接近 100 万，说明要把全表读一遍；Extra 里的 Using filesort 说明还额外做了一次文件排序。三处加在一起，这条 SQL 慢的根因就写在了脸上。

---

## 三、核心字段逐列拆解

### 1. id 与 select_type

id 是 SELECT 查询的序列标识，同一个 id 通常是同一条查询的一部分，id 越大越先执行。多表 JOIN 时所有表共用一个 id；子查询、UNION 会分出新 id。

select_type 表示 SELECT 关键字对应的查询类型，常见的：

- SIMPLE，最简单的查询，不含子查询与 UNION
- PRIMARY，最外层查询
- SUBQUERY，子查询中的第一个 SELECT
- DERIVED，FROM 子句里的派生表，也就是子查询当临时表用
- UNION，UNION 中第二个及以后的 SELECT

见到 DERIVED 要留意，它的结果物化成临时表，本身没有索引，量大了容易成为性能瓶颈。

### 2. table 与 partitions

table 是表名。partitions 是匹配到的分区，没分区就是 NULL，表建立分区后这里会列实际命中的分区范围。

### 3. type，访问方式（重点）

type 反映表的访问方式，是判断性能最直观的一列。按好到坏大致排列：

- system，表只有一行（系统表），const 的特例
- const，主键或唯一索引等值查询，最多返回一行，MySQL 直接把它当成常量
- eq_ref，JOIN 时被驱动表用主键或唯一索引等值匹配，每个驱动行最多匹配一行
- ref，非唯一索引等值查询，可能匹配多行
- range，索引范围扫描，WHERE 里出现 BETWEEN、IN、大于小于等
- index，全索引扫描，遍历整棵索引树，通常比全表扫描好一点但仍是全量
- ALL，全表扫描，性能最差

一条经验：目标是至少走到 range 以上，出现 ALL 基本就是索引没吃上，需要立刻找原因。注意 type 好到坏的顺序有些资料写法不同，但核心就一句话，const 和 eq_ref 是最优，ALL 是最差，中间 ref、range 是日常高频。

### 4. possible_keys、key、key_len、ref

- possible_keys，可能用到的索引，MySQL 先列出候选
- key，实际选用的索引
- key_len，所选索引的长度，字节数。联合索引下可以根据 key_len 反推这条查询实际用到了索引的前几列
- ref，使用索引等值查询时，与索引比较的列或常量，比如 const 代表常量

possible_keys 里有但 key 里没有，说明优化器权衡后没选它，常见原因是数据量小优化器认为全表更快，或者统计信息不准。key 为 NULL 而 possible_keys 有值，是排查索引失效的入手点。

### 5. rows 与 filtered

- rows，优化器预计要读取的行数，只作参考，不一定等于实际扫描行数
- filtered，按表条件过滤后留下来的记录数百分比，100.00 表示全部留下

rows 乘以后面的连接轮次大致能估算 IO 压力。rows 从 997572 优化到几百，性能的提升立竿见影。

### 6. Extra，附加信息（重点）

Extra 一列信息密度最高，常见值逐个说：

- Using index，使用了覆盖索引，所需字段全在索引里，无需回表，最优状态
- Using where，存储引擎返回行后 Server 层再过滤，常见于索引过滤不了全部条件的场景
- Using index condition，使用索引下推（ICP），部分 WHERE 判断下推到存储引擎层执行，减少回表
- Using filesort，需要额外排序，排序无法利用索引序时出现，优化方向是让排序走索引或建覆盖索引
- Using temporary，用了临时表，常见于 GROUP BY、ORDER BY 不一致或 UNION，量大了性能差
- Using join buffer，JOIN 时用了连接缓冲区，常见于被驱动表没有索引导致的 Block Nested-Loop

一条 SQL 同时出现 Using filesort 和 Using temporary 是最需要警惕的组合，说明排序又建了临时表，通常要重写查询或建对应索引。

---

## 四、实战案例：覆盖索引的诞生与验证

继续用上面那张 100 万行的 cus_order 表，表结构只有 id、score、name 三个字段：

```sql
CREATE TABLE `cus_order` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `score` int(11) NOT NULL,
  `name` varchar(11) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=100000 DEFAULT CHARSET=utf8mb4;
```

准备数据后执行排序语句并 EXPLAIN：

```sql
SELECT `score`,`name` FROM `cus_order` ORDER BY `score` DESC;
```

第一步没有任何索引，EXPLAIN 结果就是上一节那张表：type 为 ALL，rows 接近 100 万，Extra 是 Using filesort。此时这条 SQL 既全表扫描，又无法利用索引序排序，性能最差。

给 score 和 name 建一个联合索引，让所需字段全落进索引：

```sql
ALTER TABLE `cus_order` ADD INDEX id_score_name(score, name);
```

再 EXPLAIN 同一条 SQL：

| id | select_type | table | type | possible_keys | key | rows | Extra |
|----|-------------|-------|------|---------------|-----|------|-------|
| 1 | SIMPLE | cus_order | index | id_score_name | id_score_name | 997572 | Using index |

type 从 ALL 变成了 index，表示全索引扫描，但 Extra 变成 Using index，意味着查询要的两个字段 score、name 都包含在这个联合索引里，直接沿索引取数，全程没有回表。索引天然有序，ORDER BY score 还能直接利用索引序，连 filesort 都省了。

这个案例把两件事演示得很完整：覆盖索引能同时干掉回表和 filesort，而 EXPLAIN 的 type 与 Extra 恰好就是这两件事的体温计。

---

## 五、进阶：EXPLAIN ANALYZE 与常见误区

### 1. EXPLAIN ANALYZE（MySQL 8.0.18+）

普通 EXPLAIN 是估计值，MySQL 8.0.18 起提供 EXPLAIN ANALYZE，它会真正执行语句，并输出实际时间、实际行数、循环次数与每个算子的耗时占比。线上排重口难断的问题，可以用它拿到真实执行数据：

```sql
EXPLAIN ANALYZE SELECT score, name FROM cus_order ORDER BY score DESC;
```

输出会包含类似 actual time 与 loops 的信息，能直接看到哪个算子最耗时。注意它是真执行，大表上要谨慎使用。

### 2. 常见的三个误区

- type 是 ALL 就一定是慢 SQL。不一定。数据量很小的小表，全表扫描本身就是最优解，优化器不选索引是明智的
- rows 是实际扫描行数。rows 是优化器的估算，受统计信息影响，不代表真实执行行数
- EXPLAIN 结果好就万事大吉。EXPLAIN 看的是执行计划，真实性能还受 Buffer Pool 命中率、锁等待、网络等因素影响，计划没问题仍可能慢

### 3. 分析与优化的标准流程

拿到一条慢 SQL，按这个顺序处理：

1. EXPLAIN 看 type，落到 ALL 就找索引为什么没吃上
2. 看 key，possible_keys 有而 key 没选，查索引失效场景
3. 看 Extra，出现 filesort、temporary 就考虑建覆盖索引或改写查询
4. 看 rows，数据量确实大且无法缩小，再考虑分页、分区、架构层面手段

---

## 小结

EXPLAIN 是 SQL 优化诊断的第一步，也是面试中最常被要求现场解释的工具。核心记忆点三句话：type 反映访问方式，const、eq_ref、ref、range 是健康态，ALL 是需要警惕的全表扫；key 反映真实选用的索引，possible_keys 有而 key 无说明索引失效或优化器放弃；Extra 反映额外的代价，Using index 是最优，Using filesort、Using temporary 是要消灭的冗余操作。

下一篇进入 SQL 优化实战（二），讲慢 SQL 从哪定位、如何设计与维护索引，以及七种索引失效场景的逐一拆解。
