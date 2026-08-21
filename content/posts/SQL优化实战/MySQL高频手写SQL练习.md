---
title: "MySQL 高频手写 SQL 练习"
date: 2026-08-21T09:00:00
categories: ["计算机基础"]
tags: ["MySQL", "面试", "八股", "SQL练习", "窗口函数"]
series: "SQL 优化实战"
toc: true
weight: 10
ai_generated: true
---

# MySQL 高频手写 SQL 练习

> 定位：SQL 优化实战系列终篇，也是「题解式」八股的第一篇。八股背得再熟，手写 SQL 写不出来就露馅，面试官经常现场给一道题让写。这一篇挑了八道最常考的题，每道都给题目、表结构、参考答案和考点讲解。环境默认 MySQL 8.0，窗口函数可用。
> 收藏：本系列收录于 [后端八股复习指南](/posts/DailyDev/后端八股复习指南：博客文章索引/)。

---

## 题目一：分组 TopN

查每个班级成绩排前三的学生。这是 TopN 问题的最常见考法。

表结构：

```sql
CREATE TABLE student_score (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50),
  class VARCHAR(20),
  score INT
);
```

参考答案：

```sql
SELECT name, class, score FROM (
  SELECT name, class, score,
         ROW_NUMBER() OVER (PARTITION BY class ORDER BY score DESC) AS rn
  FROM student_score
) t
WHERE rn <= 3;
```

考点：窗口函数 PARTITION BY 分组、ORDER BY 排序，外层包一层再过滤序号。ROW_NUMBER 给唯一序号适合取前三名，若题目要求「分数并列算同名次」，改用 DENSE_RANK。

## 题目二：连续登录天数

表里记录用户每天的登录，查每个用户连续登录的最大天数。这道题考的是「差值分组」技巧。

表结构：

```sql
CREATE TABLE user_login (
  user_id INT,
  login_date DATE
);
```

参考答案：

```sql
SELECT user_id, MAX(consecutive_days) AS max_days FROM (
  SELECT user_id,
         DATE_SUB(login_date, INTERVAL rn DAY) AS group_key,
         COUNT(*) AS consecutive_days
  FROM (
    SELECT user_id, login_date,
           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY login_date) AS rn
    FROM user_login
  ) t
  GROUP BY user_id, group_key
) g
GROUP BY user_id;
```

考点：内层给每个用户按日期排号，日期减行号得到连续段的锚点，同一段内的行锚点相同，按锚点分组计数就是连续天数。再套一层取每个用户的最大值。问「至少连续登录三天」的变体，在这个结果上再加 HAVING 即可。

## 题目三：行转列

把每个月的销售额从多行转成多列，列名是月份。

表结构：

```sql
CREATE TABLE monthly_sales (
  year INT,
  month INT,
  amount DECIMAL(10,2)
);
```

参考答案（用条件聚合）：

```sql
SELECT
  year,
  SUM(CASE WHEN month = 1 THEN amount ELSE 0 END) AS jan,
  SUM(CASE WHEN month = 2 THEN amount ELSE 0 END) AS feb,
  SUM(CASE WHEN month = 3 THEN amount ELSE 0 END) AS mar
FROM monthly_sales
GROUP BY year;
```

考点：行转列没有专门的 SQL 语句，本质是条件聚合。SUM 加 CASE WHEN 把符合月份的行的金额挑出来合计，GROUP BY 按年份合并。反过来「列转行」就是用 UNION ALL 把每列拆成多行。

## 题目四：次日留存率

统计每个日期的新增用户里，第二天还活跃的比例。留存率是数据分析方向的高频题。

表结构：

```sql
CREATE TABLE user_activity (
  user_id INT,
  act_date DATE,
  PRIMARY KEY (user_id, act_date)
);
```

参考答案：

```sql
SELECT
  first.act_date AS first_date,
  COUNT(DISTINCT first.user_id) AS new_users,
  COUNT(DISTINCT second.user_id) AS retained_users,
  COUNT(DISTINCT second.user_id) / COUNT(DISTINCT first.user_id) AS retention_rate
FROM user_activity first
LEFT JOIN user_activity second
  ON first.user_id = second.user_id
  AND second.act_date = DATE_ADD(first.act_date, INTERVAL 1 DAY)
GROUP BY first.act_date;
```

考点：自连接主表与它自己，连接条件把「次日活跃」表达出来，再用 COUNT(DISTINCT) 做除法。要算 7 日、30 日留存就把 INTERVAL 改成对应天数。注意返回的留存率是小数，题目要求百分比时外层套 ROUND 乘 100 格式化。

## 题目五：累计求和

按日期统计每天累计的销售总额。

表结构：

```sql
CREATE TABLE orders (
  id INT PRIMARY KEY,
  amount DECIMAL(10,2),
  order_date DATE
);
```

参考答案：

```sql
SELECT order_date, amount, SUM(amount) OVER (ORDER BY order_date) AS running_total
FROM orders
ORDER BY order_date;
```

考点：窗口函数不带 PARTITION BY 时是对全表累计，OVER 里只写 ORDER BY 就是滚动累加。面试常追问「只统计某月份内的累计」，给 OVER 加 PARTITION BY YEAR(order_date) 即可。注意分期累计与全局累计的差别要讲清楚。

## 题目六：取中位数

查成绩表的中位数。

表结构：

```sql
CREATE TABLE scores (
  id INT PRIMARY KEY,
  score INT
);
```

参考答案（MySQL 8.0 无 PERCENTILE_CONT，用窗口定位中间行）：

```sql
SELECT AVG(score) AS median FROM (
  SELECT score,
         ROW_NUMBER() OVER (ORDER BY score) AS rn,
         COUNT(*) OVER () AS total
  FROM scores
) t
WHERE rn IN (FLOOR((total + 1) / 2), CEIL((total + 1) / 2));
```

考点：中位数对奇偶个数的处理。全表行数用窗口 COUNT(*) OVER () 拿到，中间行的序号是 (total+1)/2 向下取整和向上取整，偶数个时正好取中间两行求平均。MySQL 8.0 没有 Oracle、SQL Server 里的 PERCENTILE_CONT 函数，这个写法是通用解。

## 题目七：去重保留一条

表里存在完全重复的行，只保留其中一条。重点在物理删除重复数据。

表结构：

```sql
CREATE TABLE dups (
  id INT PRIMARY KEY,
  name VARCHAR(50),
  email VARCHAR(100)
);
```

参考答案（保留每个 email 里 id 最小的那行）：

```sql
DELETE d1 FROM dups d1
JOIN dups d2
  ON d1.email = d2.email
  AND d1.id > d2.id;
```

考点：自连接加删除的多表语法。DELETE 的目标表与 JOIN 表分开写，条件里让大 id 删小 id 留，正好剩每组最小 id。若要保留 id 最大的，把比较符号反过来。执行前先用同构 SELECT 验证删除范围，是上线前的好习惯。

## 题目八：分组内取最新一条

每个用户最近的一笔订单，需要有订单流水表。

表结构：

```sql
CREATE TABLE order_flow (
  id INT PRIMARY KEY,
  user_id INT,
  order_id VARCHAR(32),
  created_at DATETIME
);
```

参考答案：

```sql
SELECT user_id, order_id, created_at FROM (
  SELECT user_id, order_id, created_at,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
  FROM order_flow
) t
WHERE rn = 1;
```

考点：和题目一同族的 Top 1 问题，PARTITION BY user_id 分组后按时间倒序取第一行。想取最近三笔就改成 rn <= 3，想限定时间范围就在内层加 WHERE。

---

## 小结

八道题覆盖了手写 SQL 最常见的四类考点。窗口函数贯穿了 TopN、连续登录、累计求和、分组取最新，是 MySQL 8.0 时代必须熟练的工具。条件聚合 CUST WHEN 解决了行转列。自连接在留存率和去重删除里各有妙用。COUNT 配 DISTINCT、FLOOR 配 CEIL 处理留存的除法与中位数的奇偶，是数值类题的老面孔。

写 SQL 的经验一句话：先想清楚要按哪个维度分组，再把「每一组内要保留什么规则」翻译成窗口函数或聚合，最后用外层条件过滤。方向对了，答案八九不离十。进阶可以做 LeetCode 数据库题库，配合本系列的 EXPLAIN 与索引优化文章，分析与书写两条腿都稳了。
