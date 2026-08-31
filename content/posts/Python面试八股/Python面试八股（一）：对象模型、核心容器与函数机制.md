---
title: "Python 面试八股（一）：对象模型、核心容器与函数机制"
date: 2026-08-31T21:05:00
categories: ["计算机基础"]
tags: ["Python", "面试", "八股", "对象模型", "list", "dict", "函数"]
series: "Python 面试八股"
toc: true
weight: 20
ai_generated: true
description: "从对象模型、可变性、核心容器到作用域与生成器，梳理 Python 技术面最常追问的一条主线。"
---

# Python 面试八股（一）：对象模型、核心容器与函数机制

> 来源：依据 Python 3 官方语言参考与标准库文档整理，代码示例按 Python 3.9+ 语法验证。
> 定位：Python 面试八股共两篇。本篇先打语言基本盘，覆盖对象模型、可变性、复制、list/dict/set、函数传参与作用域、迭代器与生成器、类与 MRO。下一篇进入并发、内存管理与工程实践。
> 收藏：本系列收录于 [后端八股复习指南](/posts/DailyDev/后端八股复习指南：博客文章索引/)。

---

## 一、先把对象模型讲对

### 1. Python 里变量到底是什么

Python 中一切数据都以对象形式存在。对象有身份、类型和值三项属性。

- **身份**用 `is` 判断，`id()` 返回对象身份对应的整数。CPython 中它通常等同于内存地址，但这是实现细节，业务代码不能依赖。
- **类型**决定对象支持哪些操作。变量名本身不固定携带类型，名称只是绑定到某个对象；同一个名称稍后可以重新绑定到另一种类型的对象。
- **值**是否可变由对象类型决定。数字、字符串、元组通常不可变，列表、字典、集合可变。

```python
value = [1, 2]
alias = value
alias.append(3)

assert value == [1, 2, 3]
assert alias is value
```

这里没有发生列表复制，`value` 和 `alias` 只是同一对象的两个名字。面试回答不要说 Python 是传引用，也不要说 Python 是纯值传递。更准确的口径是：**名称绑定对象，函数调用传递对象引用所代表的绑定关系。**

### 2. `is` 和 `==` 的区别

`==` 比较值是否相等，必要时会调用对象的 `__eq__`；`is` 比较是不是同一个对象，不能被重载。

```python
a = [1, 2]
b = [1, 2]
c = a

assert a == b
assert a is not b
assert a is c
```

判断单例值时用 `is`，最典型的是 `value is None`。不要用 `is` 比较普通整数或字符串，即使某次运行碰巧为真，也可能只是解释器复用了不可变对象，并非语言保证。

### 3. 可变与不可变最容易失分的地方

可变对象可以原地修改，例如 `list.append()`、`dict.update()`；不可变对象的修改会创建新对象并把名称重新绑定过去。

```python
text = 'go'
old_id = id(text)
text += 'lang'

assert text == 'golang'
assert id(text) != old_id
```

元组不可变，不代表它所引用的一切对象都不可变。一个元组可以保存列表，不能替换这个列表的位置，却仍可修改列表自身：

```python
item = ([1], 'fixed')
item[0].append(2)

assert item == ([1, 2], 'fixed')
```

面试里可用一句话收束：**不可变约束的是容器中直接保存的引用关系，不会递归冻结它引用的可变对象。**

### 4. 可变默认参数为什么是坑

函数默认值在函数定义时计算一次，之后多次调用会复用同一对象。默认值若是列表或字典，状态就会跨调用累积。

```python
def wrong_append(item, bucket=[]):
    bucket.append(item)
    return bucket

assert wrong_append('a') == ['a']
assert wrong_append('b') == ['a', 'b']
```

正确做法是把 `None` 作为哨兵值，在函数体内再创建对象：

```python
def append_item(item, bucket=None):
    if bucket is None:
        bucket = []
    bucket.append(item)
    return bucket

assert append_item('a') == ['a']
assert append_item('b') == ['b']
```

这里不能写 `if not bucket`，因为调用方显式传入空列表也是合法语义。应当用 `is None` 区分未传参数和传了一个空容器。

---

## 二、赋值、浅拷贝与深拷贝

### 1. 赋值从来不是复制

赋值语句只创建名称到对象的绑定。对可变嵌套结构，若希望两个变量彼此独立，必须明确选择复制策略。

```python
import copy

original = [[1], [2]]
alias = original
shallow = copy.copy(original)
deep = copy.deepcopy(original)

original[0].append(9)

assert alias[0] == [1, 9]
assert shallow[0] == [1, 9]
assert deep[0] == [1]
```

### 2. 三种操作分别复制到哪里

| 操作 | 外层容器 | 内层可变对象 | 适用场景 |
|------|----------|--------------|----------|
| `b = a` | 不复制 | 不复制 | 明确需要共享同一对象 |
| `a.copy()` 或 `copy.copy(a)` | 新建外层 | 继续共享 | 内层不修改，或共享就是预期 |
| `copy.deepcopy(a)` | 递归复制 | 递归复制 | 需要完整隔离的嵌套配置或数据快照 |

`deepcopy` 不是默认答案。它会递归复制内容，可能复制过多，也可能破坏本应共享的对象关系。标准库会用 `memo` 记录已复制对象，避免循环引用无限递归；实际工程中仍应先明确哪些层级需要隔离，再决定是否深拷贝。

---

## 三、核心容器题

### 1. list 和 tuple 怎么选

`list` 是可变序列，适合追加、删除、排序等会修改集合本身的场景。`tuple` 是不可变序列，适合表达固定结构的记录、函数多返回值和可作为字典键的值对象。

| 维度 | list | tuple |
|------|------|-------|
| 是否可原地修改 | 可以 | 不可以 |
| 常见用途 | 动态任务队列、收集结果 | 固定坐标、不可变配置、解包返回值 |
| 能否作为 dict 的键 | 不可以 | 元素全部可哈希时可以 |
| 表达的业务语义 | 这批元素会变 | 这组位置和结构固定 |

不要把 CPython 的底层动态数组实现当作 Python 语言规范来背。面试若追问实现，可以补一句：CPython 的 list 采用连续存储并为扩容预留空间，但跨解释器或跨版本的性能结论应以实测为准。

### 2. list 的三个常见陷阱

切片会创建一个新的外层列表，但其中元素仍是原引用：

```python
rows = [[1], [2]]
part = rows[:]
part[0].append(9)

assert rows == [[1, 9], [2]]
assert part is not rows
```

列表乘法复制的是元素引用，不是递归复制。下面写法会让三行指向同一列表：

```python
wrong_grid = [[0] * 3] * 3
wrong_grid[0][0] = 1

assert wrong_grid == [[1, 0, 0], [1, 0, 0], [1, 0, 0]]
```

正确写法用推导式，每次循环创建一行：

```python
grid = [[0] * 3 for _ in range(3)]
grid[0][0] = 1

assert grid == [[1, 0, 0], [0, 0, 0], [0, 0, 0]]
```

另外，`list.sort()` 原地排序并返回 `None`，`sorted()` 返回新列表。把 `items = items.sort()` 写进生产代码会得到 `None`，是常见笔试坑。

### 3. dict 的关键不是背哈希表，而是哈希约束

字典是键到值的映射。键必须可哈希，含义是对象的哈希值在生命周期内保持不变，并且两个相等对象必须有相同哈希值。

```python
scores = {'alice': 90}
assert scores.get('bob') is None

try:
    scores['bob']
except KeyError:
    pass
else:
    raise AssertionError('缺失键应当抛出 KeyError')
```

`dict[key]` 适合键不存在就是异常的场景，`dict.get(key, default)` 适合键缺失可被默认值吸收的场景。二者不能机械互换。

常见可哈希键有字符串、整数，以及元素全部可哈希的元组；列表、字典、集合本身不可哈希。自定义类若覆写 `__eq__`，还要审视 `__hash__` 的一致性，否则实例可能不能安全用作字典键或集合元素。

当前 Python 保证字典按插入顺序迭代。更新已有键不会改变位置，删除后重新插入会出现在末尾。它保证的是插入顺序，不是键大小顺序。

### 4. set 适合什么问题

集合保存不重复的可哈希元素，适合成员判定、去重、交并差等问题：

```python
seen = {'a', 'b'}
seen.add('a')
seen.add('c')

assert seen == {'a', 'b', 'c'}
assert 'b' in seen
assert {'a', 'b'} & {'b', 'c'} == {'b'}
```

空集合必须写 `set()`，`{}` 表示空字典。面试手写题里，这个细节很常被用来卡人。

### 5. `defaultdict` 和 `dict.setdefault` 的取舍

分组、计数是字典的高频实战场景。键不存在时，`collections.defaultdict` 可以自动构造默认值：

```python
from collections import defaultdict

groups = defaultdict(list)
for name, city in [('alice', 'beijing'), ('bob', 'beijing'), ('carl', 'shanghai')]:
    groups[city].append(name)

assert groups['beijing'] == ['alice', 'bob']
```

只有少量分支时，`setdefault` 也能写；循环中反复分组则优先 `defaultdict`，语义更直白。若读取一个不存在的键不应改变字典，使用 `get`，不要误用 `defaultdict[key]`。

---

## 四、函数、作用域与闭包

### 1. Python 的参数传递怎么讲

函数拿到的是对象绑定。函数内原地修改传入的可变对象，调用方可见；函数内把局部变量重新绑定到新对象，调用方原来的名称不受影响。

```python
def mutate_and_rebind(items):
    items.append('seen')
    items = ['new']
    return items

source = []
result = mutate_and_rebind(source)

assert source == ['seen']
assert result == ['new']
```

标准答法是：**Python 传的是对象引用的绑定，修改对象会外溢，重绑局部名称不会外溢。** 这比简单说引用传递更严谨。

### 2. LEGB 与 `global`、`nonlocal`

名称查找遵循 LEGB 次序，依次经过局部作用域、闭包所在的外层作用域、模块全局作用域和内建作用域。

- 给函数内名称赋值，默认创建局部变量。
- `global name` 表示后续赋值绑定模块级名称。
- `nonlocal name` 表示后续赋值绑定最近一层外部函数中的名称，不能指向模块全局。

```python
def make_counter():
    count = 0

    def increase():
        nonlocal count
        count += 1
        return count

    return increase

counter = make_counter()
assert counter() == 1
assert counter() == 2
```

`nonlocal` 是闭包状态更新的关键。少了它，`count += 1` 会被当作对局部变量赋值，并抛出 `UnboundLocalError`。

### 3. 闭包循环变量为什么常出错

闭包捕获的是名称，不是创建闭包那一刻的快照。循环结束后，多个函数可能都去读取同一个最终值。

```python
wrong = [lambda: i for i in range(3)]
assert [func() for func in wrong] == [2, 2, 2]

right = [lambda i=i: i for i in range(3)]
assert [func() for func in right] == [0, 1, 2]
```

右边写法把当前 `i` 放进 lambda 的默认参数，使每个函数保存独立值。面试中说清捕获的是变量绑定而非立即值，便能答到根上。

### 4. 装饰器的本质

装饰器接收可调用对象，返回一个可调用对象。`@decorator` 只是把函数定义后的结果重新绑定：

```python
from functools import wraps

def logged(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        print(f'calling {func.__name__}')
        return func(*args, **kwargs)
    return wrapper

@logged
def add(left, right):
    return left + right

assert add(1, 2) == 3
assert add.__name__ == 'add'
```

`functools.wraps` 不是装饰。它把原函数的名称、文档等元数据拷回包装函数，方便日志、调试、路由注册和测试框架正确识别被装饰对象。

---

## 五、迭代器、生成器与类

### 1. iterable、iterator、generator 三者关系

可迭代对象能传给 `iter()`，例如列表、字符串、字典。迭代器额外支持 `next()`，每次产出一个元素，耗尽时抛出 `StopIteration`。生成器是由生成器函数或生成器表达式创建的一类迭代器。

```python
def read_batches(items, size):
    for start in range(0, len(items), size):
        yield items[start:start + size]

batches = read_batches([1, 2, 3, 4, 5], 2)
assert next(batches) == [1, 2]
assert list(batches) == [[3, 4], [5]]
```

生成器按需产出数据，适合流式读取和大批量处理。它通常只能完整消费一次，不能把已经耗尽的生成器当作可重复使用的列表。

### 2. `super()` 与 MRO

多继承场景中，`super()` 不是简单调用直接父类，而是按照方法解析顺序寻找下一个实现。Python 使用 C3 线性化确定 MRO。

```python
class A:
    pass

class B(A):
    pass

class C(A):
    pass

class D(B, C):
    pass

assert D.__mro__ == (D, B, C, A, object)
```

菱形继承里若每层都用 `super()` 并遵守协作式调用约定，共同祖先只会按 MRO 链执行一次。直接写 `Parent.method(self)` 容易跳过链路或重复调用，通常只在明确需要绕过协作式继承时才用。

---

## 六、面试答题总纲

| 题目 | 先给结论 | 再补机制 |
|------|----------|----------|
| `is` 和 `==` | 前者比身份，后者比值 | `is` 常用于 `None`，不要依赖小整数或字符串驻留 |
| Python 怎么传参 | 传对象绑定 | 原地修改外溢，局部重绑不外溢 |
| 浅拷贝和深拷贝 | 浅拷外层，深拷嵌套对象 | 先确认共享关系，不把 `deepcopy` 当万能药 |
| dict 的键为什么要可哈希 | 查找依赖稳定哈希与相等性 | 相等对象必须同哈希，可变容器不能做键 |
| 默认参数为什么不能写 `[]` | 默认值只在定义时创建一次 | 多次调用复用同一列表，`None` 是常用哨兵 |
| 生成器有什么价值 | 惰性生产，降低峰值内存 | 可流式处理，耗尽后不能重放 |

---

## 小结

Python 基础题看起来散，真正的主线只有一条：对象与名称的关系。理解名称绑定对象，就能自然解释赋值不复制、可变参数外溢、浅深拷贝和 `is` 与 `==`；理解哈希与相等性的契约，就能解释 dict 与 set 的限制；理解 LEGB 和闭包捕获的是名称，就能避开默认参数和循环 lambda 两类经典坑。下一篇把这条主线延伸到运行时，讲清 GIL、线程、协程、进程、垃圾回收和资源管理。

## 参考资料

- [Python 语言参考：数据模型](https://docs.python.org/3/reference/datamodel.html)
- [Python 标准类型与映射类型 dict](https://docs.python.org/3/library/stdtypes.html#mapping-types-dict)
- [copy：浅拷贝与深拷贝](https://docs.python.org/3/library/copy.html)
- [Python 教程：数据结构](https://docs.python.org/3/tutorial/datastructures.html)
