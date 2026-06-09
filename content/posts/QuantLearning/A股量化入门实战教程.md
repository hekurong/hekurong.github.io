---
title: "从零开始学A股量化：沪深300指数策略实战教程"
date: 2026-06-09
draft: false
categories: ["QuantLearning"]
tags: ["量化交易", "Python", "沪深300", "策略回测", "AKShare", "初学者"]
description: "手把手教你从零搭建A股量化系统：数据获取、技术指标、策略回测、绩效评估，一篇文章全搞定。"
toc: true
weight: 10
summary: "这是一篇面向纯小白的A股量化入门教程，用沪深300指数为标的，从环境搭建到多策略对比，一步步带你走进量化交易的大门。全文约8000字，包含完整可运行的Python代码。"
---

## 前言

量化交易，听起来很高大上。但其实用一句话就能说清楚：

**用量化的方法做交易决策**——把"这只股票感觉要涨"变成"当MA5上穿MA20时买入"这样可验证、可回测、可优化的规则。

这篇文章是为完全零基础的你准备的。我们会用 Python + 沪深300指数，一步步搭建一个完整的量化分析系统。读完你会：

- 知道量化交易是怎么回事
- 能自己获取A股数据
- 会计算常用技术指标
- 能写策略并回测验证
- 能看懂回测报告里的各种指标

整个教程用的代码，都在这个 GitHub 仓库里：[Quant-Learning](https://github.com/KurongTohsaka/Quant-Learning)

---

## 第一章：量化交易是什么

### 1.1 投资 vs 量化

传统的投资决策，靠的是"感觉"和"经验"：

- "茅台是好公司，买了放着"
- "最近大盘跌了很多，应该抄底了"
- "这个K线形态像头肩底，要涨"

这些判断没法验证——你说"感觉要涨"，怎么证明你是对的还是错的？

量化交易把决策过程变成**可编程的规则**：

- "当 **5日均线上穿20日均线**时买入，下穿时卖出"
- 这条规则可以用过去10年的数据去验证
- 验证后可以算出来：这个策略的年化收益率是多少、最大回撤是多少、胜率是多少

### 1.2 量化的四个步骤

```
数据 → 策略 → 回测 → 评估
```

1. **数据**：拿到历史行情数据（开盘价、收盘价、成交量等）
2. **策略**：写出买卖规则（比如金叉买入死叉卖出）
3. **回测**：用历史数据模拟交易，看策略表现
4. **评估**：看收益率、回撤、胜率等指标，判断策略好坏

然后回到第一步，优化数据或策略，循环迭代。

### 1.3 我们用什么标的

本文用 **沪深300指数** 作为学习标的。

为什么是指数而不是个股？

| 对比 | 个股 | 指数 |
|------|------|------|
| 数据长度 | 一般10年左右 | 20年+ |
| 代表性 | 受单一公司影响 | 反映整体市场 |
| 学习价值 | 有退市风险 | 更适合学方法 |
| 策略普适性 | 个股专属 | 可迁移到其他指数 |

而且沪深300指数的数据从2002年就有了，近6000个交易日的数据，回测样本非常充足。

> 小知识：沪深300ETF（510300）跟踪的就是沪深300指数，两者走势几乎一致。学会了指数的策略，直接用在ETF上也行。

---

## 第二章：环境搭建

### 2.1 安装 Python

确保你的电脑上有 Python 3.9 或更高版本：

```bash
python3 --version
```

如果没有，去 [python.org](https://python.org) 下载安装。

### 2.2 安装 uv（快速包管理器）

我们用 `uv` 来管理 Python 依赖，比 `pip` 快很多：

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

安装后重启终端，验证：

```bash
uv --version
```

### 2.3 创建项目

```bash
mkdir Quant-Learning
cd Quant-Learning
uv init
```

### 2.4 安装依赖

```bash
uv add akshare pandas numpy matplotlib mplfinance ta
```

安装的包各自的作用：

| 包名 | 用途 |
|------|------|
| **akshare** | 获取A股数据（开源免费，无需注册） |
| **pandas** | 数据处理（Python里的Excel） |
| **numpy** | 数值计算 |
| **matplotlib** | 画图工具 |
| **mplfinance** | 专门画K线图的工具 |
| **ta** | 技术指标计算库（MA、MACD、RSI等） |

安装完成后，你的 `pyproject.toml` 应该类似这样：

```toml
[project]
name = "quant-learning"
version = "0.1.0"
description = "A股量化入门学习"
requires-python = ">=3.9"
dependencies = [
    "akshare>=1.18.64",
    "matplotlib>=3.9.4",
    "mplfinance>=0.12.10b0",
    "numpy>=2.0.2",
    "pandas>=2.3.3",
    "ta>=0.11.0",
]
```

### 2.5 项目目录结构

这是我们最终的项目结构：

```
Quant-Learning/
├── utils/
│   └── data_fetcher.py      # 数据获取工具
├── step_01_get_data.py       # 第1步：数据获取
├── step_02_indicators.py     # 第2步：技术指标
├── step_03_visualization.py  # 第3步：可视化
├── step_04_strategy_ma.py    # 第4步：双均线策略
├── step_05_strategy_macd.py  # 第5步：MACD策略
├── step_06_strategy_comparison.py  # 第6步：多策略对比
├── data/                     # 缓存的数据
├── images/                   # 生成的图表
├── pyproject.toml
└── README.md
```

建议按照 step_01 到 step_06 的顺序运行，每一步都建立在前一步的基础上。

---

## 第三章：数据获取——做量化的第一步

### 3.1 数据源怎么选

做A股量化，数据源是第一个要解决的问题。常见的选择：

| 数据源 | 费用 | 注册 | 数据范围 | 稳定性 |
|--------|------|------|----------|--------|
| **AKShare** | 免费 | 无需 | 股票/基金/期货/宏观经济 | ⭐⭐⭐⭐ |
| Tushare | 部分免费 | 需要token | 同上 | ⭐⭐⭐⭐⭐ |
| Baostock | 免费 | 无需 | 股票/指数 | ⭐⭐⭐ |
| 万得/聚宽 | 付费 | 需要 | 专业级 | ⭐⭐⭐⭐⭐ |

对于学习来说，**AKShare** 是最好的选择——不用注册、不用付费、接口最全。

### 3.2 第一个数据获取函数

我们从 AKShare 获取沪深300指数的历史数据。先写一个简单的工具函数：

```python
# utils/data_fetcher.py

import pandas as pd
import akshare as ak


def fetch_index_data(symbol="sh000300", start_date="2015-01-01", end_date="2026-12-31"):
    """
    获取指数历史数据
    
    参数:
        symbol: 指数代码
            sh000300 = 沪深300
            sh000001 = 上证指数
            sz399006 = 创业板指
        start_date: 开始日期 (YYYY-MM-DD)
        end_date: 结束日期 (YYYY-MM-DD)
    
    返回:
        包含 open/high/low/close/volume/returns 的 DataFrame
    """
    # 调用 AKShare 接口
    df = ak.stock_zh_index_daily(symbol=symbol)
    
    # 列名转小写
    df.columns = [c.lower() for c in df.columns]
    
    # 日期处理
    df["date"] = pd.to_datetime(df["date"])
    df.set_index("date", inplace=True)
    df.sort_index(inplace=True)
    
    # 过滤日期范围
    df = df.loc[start_date:end_date].copy()
    
    # 添加收益率列
    df["returns"] = df["close"].pct_change()
    
    return df
```

### 3.3 一行行解释

对初学者来说，每行代码在做什么要清楚：

```python
ak.stock_zh_index_daily(symbol="sh000300")
```
这行调用 AKShare 的接口，从服务器拉取沪深300指数的全部历史数据（2002年到今天）。返回的是一个 **DataFrame**——可以理解为Excel表格。

```python
df.columns = [c.lower() for c in df.columns]
```
原始数据的列名是大写的如 `Date`、`Open`，我们统一转成小写更方便处理。

```python
df["date"] = pd.to_datetime(df["date"])
df.set_index("date", inplace=True)
```
日期列转成真正的日期类型，然后设为行索引。这样后续按日期切片就很方便。

```python
df.sort_index(inplace=True)
```
确保数据按日期升序排列（最早的在前）。

```python
df["returns"] = df["close"].pct_change()
```
计算**每日收益率**。`pct_change()` 是 pandas 自带的函数，计算相邻两行的百分比变化。公式是：

```
当日收益率 = (当日收盘价 - 前日收盘价) / 前日收盘价
```

第一天的收益率是 NaN（因为没有前一天的数据）。

### 3.4 数据长什么样

调用上面的函数后，数据是这样的：

```
               open      high       low     close       volume   returns
date                                                                     
2024-01-02  3426.268  3426.268  3386.352  3386.352  11618072600       NaN
2024-01-03  3379.750  3392.850  3362.662  3378.297  10561385100 -0.002379
2024-01-04  3375.021  3375.021  3323.865  3347.052  10672101300 -0.009249
```

每行是一个交易日，包含：
- **open**：开盘价
- **high**：最高价
- **low**：最低价
- **close**：收盘价（最重要的一列，大部分指标基于它计算）
- **volume**：成交量（沪深300指数单位是"元"，不是"股"）
- **returns**：当日收益率

### 3.5 数据检查清单

拿到数据后，先做这几件事：

```python
df.shape        # (行数, 列数) — 看看数据量
df.info()       # 列名、类型、非空数量
df.isnull().sum()  # 每列有多少缺失值
df.describe()   # 基本统计量（均值、标准差、分位数等）
```

对初学者来说，**缺失值检查**很重要——技术指标计算会产生大量 NaN，后面做策略时要跳过它们。

---

## 第四章：技术指标——量化的语言

拿到了数据，接下来要计算各种技术指标。指标就是把原始的价格数据加工成有意义的信号。

### 4.1 移动平均线 MA（Moving Average）

最简单的指标。计算过去N天的平均收盘价。

**为什么要有MA？** 单天的价格波动很大（噪声），平滑后更容易看出趋势。

**手动实现：**

```python
df["MA5"] = df["close"].rolling(window=5).mean()
df["MA20"] = df["close"].rolling(window=20).mean()
```

`rolling(window=5)` 表示"每5天为一个窗口"，`mean()` 计算平均值。

> 注意：前4行会是 NaN——因为不够5天的数据。MA20 则需要前19天数据才有第一个值。

**MA 的意义**：
- **MA5**（5日均线）：短线趋势，本周走势
- **MA20**（20日均线）：中线趋势，近一个月走势
- **MA60**（60日均线）：长线趋势，近一季走势

当短期均线从下方穿过长期均线时，叫**金叉**，是买入信号。
当短期均线从上方穿过长期均线时，叫**死叉**，是卖出信号。

### 4.2 MACD 指标

MACD 是 MA 的升级版，计算稍微复杂一些，但思想是一样的——比较快线和慢线的位置关系。

我们用 `ta` 库来计算，不用自己手动算：

```python
import ta

# 计算 MACD
macd = ta.trend.MACD(close=df["close"])
df["MACD"] = macd.macd()        # DIF 线（快线）
df["MACD_signal"] = macd.macd_signal()  # DEA 线（慢线）
df["MACD_hist"] = macd.macd_diff()      # 柱状图（DIF - DEA）
```

**怎么看MACD：**

- **金叉**：MACD线从下方上穿Signal线 → 买入信号
- **死叉**：MACD线从上方下穿Signal线 → 卖出信号
- **零轴上方**：多头市场
- **零轴下方**：空头市场

进阶用法：**零轴下方的金叉**比零轴上方的金叉更可靠（因为这时股票刚从底部反弹，上涨空间更大）。

### 4.3 RSI 相对强弱指标

RSI 衡量价格变动的力度。取值范围 0-100。

```python
df["RSI"] = ta.momentum.rsi(close=df["close"], window=14)
```

**解读：**
- **RSI > 70**：超买，价格可能回调（考虑卖出）
- **RSI < 30**：超卖，价格可能反弹（考虑买入）
- **RSI = 50**：中性

### 4.4 布林带 Bollinger Bands

布林带由三条线组成：中轨（MA20）+ 上下轨（MA20 ± 2倍标准差）。

```python
bb = ta.volatility.BollingerBands(close=df["close"], window=20, window_dev=2)
df["BB_upper"] = bb.bollinger_hband()   # 上轨
df["BB_middle"] = bb.bollinger_mavg()    # 中轨（MA20）
df["BB_lower"] = bb.bollinger_lband()   # 下轨
```

**意义：**
- 价格触及上轨 → 可能超买
- 价格触及下轨 → 可能超卖
- 布林带收窄 → 即将变盘
- 布林带扩张 → 趋势加速

### 4.5 ATR 平均真实波幅

ATR 衡量波动率——价格一天波动多大。

```python
df["ATR"] = ta.volatility.average_true_range(
    high=df["high"], low=df["low"], close=df["close"], window=14
)
```

**用途：**
- ATR 越大 → 波动越剧烈，风险越高
- 用于设置止损：比如入场价的 2倍ATR 处设止损

### 4.6 把所有指标汇总

运行 `step_02_indicators.py` 后，数据框从最初的6列变成了25列：

```
['open', 'high', 'low', 'close', 'volume', 'returns',
 'MA5_manual', 'MA10_manual', 'MA20_manual', 'MA60_manual',
 'MA5_ta', 'MA10_ta', 'MA20_ta', 'MA60_ta',
 'MACD', 'MACD_signal', 'MACD_hist',
 'RSI',
 'BB_upper', 'BB_middle', 'BB_lower', 'BB_width', 'BB_pct',
 'ATR', 'ATR_pct']
```

这就是"特征工程"——把原始价格数据加工成有信息量的特征。

---

## 第五章：数据可视化——一图胜千言

光看数字很难发现规律，画出来就一目了然。

### 5.1 K线图

K线图是量化交易最基础的图表，包含四个信息：开盘价、收盘价、最高价、最低价。

用 `mplfinance` 画K线图很简单：

```python
import mplfinance as mpf

mpf.plot(df, type='candle', volume=True, style='charles')
```

如果要叠加均线：

```python
ap = [
    mpf.make_addplot(df["MA5"], color='blue', width=0.8),
    mpf.make_addplot(df["MA20"], color='orange', width=0.8),
]
mpf.plot(df, type='candle', volume=True, style='charles', addplot=ap)
```

效果如下图（示例）：
![K线+均线](/images/candlestick.png)

**怎么看K线图：**
- 红色/k线实体：收盘价 > 开盘价（上涨）
- 绿色/蓝色实体：收盘价 < 开盘价（下跌）
- 上下影线：最高价/最低价到实体之间的波动

### 5.2 多子图指标面板

把多个指标画在一起，方便对比：

```python
fig, axes = plt.subplots(4, 1, figsize=(14, 10), sharex=True)

# 子图1: 价格+均线
axes[0].plot(df["close"], label="收盘价")
axes[0].plot(df["MA20"], label="MA20")

# 子图2: 成交量
axes[1].bar(df.index, df["volume"])

# 子图3: MACD
axes[2].bar(df.index, df["MACD_hist"])
axes[2].plot(df["MACD"])
axes[2].plot(df["MACD_signal"])

# 子图4: RSI + 超买超卖线
axes[3].plot(df["RSI"])
axes[3].axhline(70, color='r', linestyle='--')  # 超买线
axes[3].axhline(30, color='g', linestyle='--')  # 超卖线
```

看到这样的图，你会直观地发现：
- RSI到70以上时，价格往往在阶段性顶部
- MACD金叉时，价格开始上涨
- 收盘价跌破MA20时，趋势可能反转

---

## 第六章：策略回测——最核心的部分

有了数据和指标，接下来要**验证策略是否有效**。

### 6.1 什么是回测

回测就是用**过去的数据**模拟交易。如果策略在过去10年都赚不到钱，凭什么相信它未来能赚钱？

回测的过程：

```
1. 写策略规则（比如金叉买入，死叉卖出）
2. 逐日模拟：每天检查是否触发买卖信号
3. 记录每次交易和每日持仓
4. 计算最终的收益和风险指标
```

### 6.2 核心概念：避免未来数据

这是量化新手最容易犯的错误，也是最重要的概念。

**什么是未来数据？** 在回测中使用"当时还不知道"的信息。

举例：

```
❌ 错误做法：
if df["MA5"].iloc[i] > df["MA20"].iloc[i]:  # 当天收盘后才知道
    买入

✅ 正确做法：
if df["MA5"].iloc[i-1] > df["MA20"].iloc[i-1]:  # 用前一天的收盘数据
    在第二天开盘买入
```

简单说：**今天的信号，明天才能交易**。我们用 `.shift(1)` 来实现这个"滞后"：

```python
df["signal"] = df["position_raw"].shift(1)  # 信号滞后一天
```

### 6.3 双均线策略完整实现

```python
import pandas as pd
import numpy as np
from utils.data_fetcher import fetch_index_data

# 1. 获取数据
df = fetch_index_data("sh000300", "2020-01-01", "2024-12-31")

# 2. 计算指标
df["MA5"] = df["close"].rolling(5).mean()
df["MA20"] = df["close"].rolling(20).mean()

# 3. 生成信号
# 金叉: MA5 上穿 MA20 → 买入(1)
# 死叉: MA5 下穿 MA20 → 卖出(-1)
df["signal_raw"] = np.where(
    (df["MA5"] > df["MA20"]) & (df["MA5"].shift(1) <= df["MA20"].shift(1)), 1,
    np.where(
        (df["MA5"] < df["MA20"]) & (df["MA5"].shift(1) >= df["MA20"].shift(1)), -1,
        0
    )
)

# 4. 避免未来数据：滞后一天
df["signal"] = df["signal_raw"].shift(1)

# 5. 构建持仓序列
df["position"] = 0  # 初始空仓
for i in range(1, len(df)):
    if df["signal"].iloc[i] == 1:
        df.loc[df.index[i], "position"] = 1  # 买入
    elif df["signal"].iloc[i] == -1:
        df.loc[df.index[i], "position"] = 0  # 卖出
    else:
        df.loc[df.index[i], "position"] = df["position"].iloc[i-1]  # 保持

# 6. 计算收益
df["returns"] = df["close"].pct_change()
df["strategy_returns"] = df["position"].shift(1) * df["returns"]

# 7. 计算累计净值
df["cumulative_benchmark"] = (1 + df["returns"]).cumprod()
df["cumulative_strategy"] = (1 + df["strategy_returns"]).cumprod()
```

### 6.4 逐行解释策略逻辑

```python
np.where(
    (df["MA5"] > df["MA20"]) & (df["MA5"].shift(1) <= df["MA20"].shift(1)),
    1,  # 条件成立 → 买入信号
    ...
)
```

`np.where` 类似于Excel的IF函数。这里判断的是：**今天 MA5 > MA20，且昨天 MA5 <= MA20**。这就是"上穿"的定义——不是今天大于就行，而是要从小于变成大于。

**为什么用 `.shift(1)` 看昨天？** 因为我们想知道"今天是否刚发生了金叉"，而不是"今天是否处于金叉状态"。

### 6.5 绩效指标

光跑完回测还不够，要能看懂回测报告。

#### 总收益率

最简单的指标：

```python
total_return = df["cumulative_strategy"].iloc[-1] - 1
```

表示策略从开始到结束总共赚了（或亏了）多少。

#### 年化收益率

把总收益率换算成"每年赚多少"，方便不同时间长度的策略对比：

```python
annual_return = (1 + total_return) ** (252 / n_days) - 1
```

252 是一年的交易日数。

#### 最大回撤

**最大回撤**是量化最重要的风险指标之一。它衡量的是"曾经最多亏了多少"：

```python
cumulative_max = df["cumulative_strategy"].cummax()  # 历史最高净值
drawdown = (df["cumulative_strategy"] - cumulative_max) / cumulative_max
max_drawdown = drawdown.min()  # 最深的一次回撤
```

**举例**：你的策略净值从100万涨到150万，然后跌到90万——最大回撤就是 40%（从150跌到90）。

#### 夏普比率

夏普比率衡量"每承担一份风险，获得多少超额收益"：

```
夏普比率 > 1：好
夏普比率 > 2：非常好
夏普比率 > 3：极其优秀
夏普比率 < 0：不如买国债
```

计算公式：

```python
sharpe = np.sqrt(252) * df["strategy_returns"].mean() / df["strategy_returns"].std()
```

#### 胜率

```python
win_rate = profitable_trades / total_trades
```

**注意**：胜率高不一定是好策略。一个策略胜率40%，但赚一次赚10%、亏一次亏3%，最后也是赚钱的。

#### 盈亏比

```python
profit_loss_ratio = avg_profit / abs(avg_loss)
```

盈亏比 > 2 说明"赚一次够亏两次"。

### 6.6 双均线策略的回测结果

运行 `step_04_strategy_ma.py` 得到的回测报告示例：

```
======================================================================
  双均线策略回测报告
======================================================================
  总收益率                           -5.74%
  年化收益率                          -1.24%
  最大回撤                          -26.49%
  夏普比率(年化)                        -0.17
  总交易次数                              43
  胜率                             30.23%
  盈亏比(盈利/亏损)                       2.27
======================================================================
```

这个结果在2020-2024年区间表现不佳。这不是代码有问题——**这恰恰说明量化不是魔法**: 简单的金叉死叉策略在震荡市中会被反复打脸。

这引出了量化的核心思想：**没有完美的策略，只有适合特定市场的策略**。

---

## 第七章：多策略对比

一个策略不够？那就比三个。

### 7.1 三个策略同时跑

我们让三个策略在同一数据、同一时间段上回测：

1. **双均线策略** (MA5/20金叉死叉)
2. **MACD策略** (DIF/DEA金叉死叉)
3. **布林带回归策略** (触下轨买入，触上轨卖出)

每个策略都用同一个 `run_backtest` 函数：

```python
def run_backtest(df, strategy_func, strategy_name):
    """通用回测函数，返回绩效指标字典"""
    # ... 策略逻辑由 strategy_func 提供 ...
    return {
        "total_return": ...,
        "annual_return": ...,
        "max_drawdown": ...,
        "sharpe_ratio": ...,
        "win_rate": ...,
        "total_trades": ...,
        "profit_loss_ratio": ...,
    }
```

### 7.2 策略对比表

运行 `step_06_strategy_comparison.py` 后得到的排名表：

```
排名  策略名称        年化收益率  最大回撤  夏普比率  胜率    交易次数
1   MACD策略         0.13%    -35.07%   0.08    25.49%  51
2   布林带回归策略    -1.89%   -30.58%  -0.08    58.33%  12
3   双均线策略        -2.09%   -31.57%  -0.09    22.73%  44
```

观察几个有意思的现象：

- **MACD策略勉强跑赢基准**（基准同期年化约-1.14%）
- **布林带回归策略胜率最高**（58%），在震荡市中表现较好
- **没有一个策略能稳定赚钱**——这很正常，2020-2024年沪深300整体是下跌的

### 7.3 风险指标

除了基础指标，我们还加了一些进阶风险指标：

- **Calmar比率** = 年化收益率 / 最大回撤绝对值。衡量"每承担1%的回撤，赚多少收益"。Calmar > 1 说明回撤控制得好。
- **收益波动率** = 日收益率标准差 × √252。衡量策略的波动剧烈程度。
- **最大连续盈利/亏损天数**：策略最好和最差的一段表现。

---

## 第八章：常见陷阱与忠告

### 8.1 回测的陷阱

**陷阱1：过拟合**

你用一个策略在过去的测试中表现很好，但那是因为你反复调整参数去"拟合"过去的数据。这样的策略到未来大概率失效。

解决方法：**样本外测试**——把数据分成训练集（比如2015-2022）和测试集（2023-2025），只在训练集上调参数，测训练集的表现在测试集上是否依然好。

**陷阱2：幸存者偏差**

回测时只用了现在还存活的股票，那些退市了的、暴雷的股票没算进去。这会让回测结果看起来比实际好。

**陷阱3：手续费和滑点**

实盘交易有手续费（买卖ETF是万分之几），而且大额交易会影响价格（滑点）。回测时把这些算进去会更真实。

### 8.2 给初学者的忠告

1. **不要用实盘的钱去测试策略**。先用历史数据回测，然后用模拟盘验证。

2. **简单的策略往往比复杂的好**。双均线策略虽然简单，但它在趋势行情中就是能赚钱。复杂的策略容易过拟合。

3. **先理解指标的意义，再使用它**。不要因为"别人在用MACD"你就用。要理解为什么MACD金叉后股价倾向于上涨（因为市场情绪转变的趋势有惯性）。

4. **警惕高收益低回撤的策略**。如果一个策略宣称年化30%但最大回撤只5%，大概率是拟合出来的。

5. **量化交易是概率游戏**。没有100%胜率的策略。关键是期望值为正——赚的比亏的多。

---

## 下一步可以做什么

学完这个教程，你已经掌握了量化的基本功。接下来可以：

1. **换标的试试**：把沪深300换成中证500（sh000905）或创业板指（sz399006），看同样的策略在不同市场表现如何

2. **优化参数**：MA5/20 是最常用的参数，但试试 MA10/30 或者 MA20/60 会怎样？

3. **增加止损**：在策略中加入"亏损超过5%就平仓"的规则

4. **多因子策略**：不只用技术指标，加入基本面数据（PE、PB、ROE）

5. **学习更多策略**：海龟交易法则、网格交易、动量策略、均值回归

6. **接入实盘**：通过券商的API，把策略部署到实盘（建议先用模拟盘跑3-6个月）

---

## 代码获取

本文全部代码已上传 GitHub：
[https://github.com/KurongTohsaka/Quant-Learning](https://github.com/KurongTohsaka/Quant-Learning)

```bash
git clone git@github.com:KurongTohsaka/Quant-Learning.git
cd Quant-Learning
uv run python step_01_get_data.py
```

---

## 写在最后

量化交易不是一夜暴富的工具，它是一套**科学决策的方法论**。学会它，你至少能做到：

- 不再凭感觉买卖
- 能客观评估自己的交易策略
- 知道为什么亏钱（而不是"运气不好"）

就像学做菜一样，先跟着菜谱做（本文的代码），然后慢慢理解火候和调味（策略逻辑和参数），最后创造自己的菜式（你自己的策略）。

祝你开启量化之旅，收获满满。

---

*本文发布于 2026-06-09，数据来源为 AKShare，代码基于 Python 3.9+。*
