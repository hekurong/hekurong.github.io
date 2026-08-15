# KurongBlog

Kurong 的技术博客源码仓库，由 [Chenhai-hugo](https://github.com/KurongTohsaka/Chenhai-hugo)（自研 Go 静态博客生成器）构建。

- 线上站点：https://hekurong.github.io
- **RSS 订阅**：https://hekurong.github.io/atom.xml

## 工作流

```
Typora 写 .md → chenhai deploy -m "msg" → GitHub Actions 构建 → Pages 发布
```

带图文章：`chenhai image add 截图.png --post posts/分类/文章.md` 自动压缩转 WebP 并生成引用。

## 目录

- `content/posts/` — 文章源码（Markdown + Front Matter）
- `static/` — 静态资源（图片等）
- `config.yaml` — 站点配置
- `public/` — 构建输出（gitignored，由 CI 生成）
