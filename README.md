# jiatuo-blog-serverless

一个运行在 Cloudflare 无服务器架构上的个人博客。Bento 风格个人空间，可直接在页面上编辑。

原项目：[snowhejia/momo-blog](https://github.com/snowhejia/momo-blog)（React + Express + SQLite）
本项目：完整移植到 **Cloudflare Workers + Hono + D1 + R2**，零服务器运维。

## 特性

- 🎨 **Bento 个人空间**：作品、文字、照片、灵感卡片，拖拽排版
- 🎵 **音乐播放器**：后台音乐、播放列表、睡眠定时、倍速
- 🌗 **多主题**：10+ 套主题一键切换
- ✏️ **可视化编辑**：登录后直接在页面上改内容、传图片/音乐
- 📱 **移动端适配**：手机、电脑自适应
- ⚡ **无服务器**：Workers + D1 + R2，按量付费，免费额度够个人用

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | React 19 + Vite + React Router |
| 后端 | Cloudflare Workers + Hono |
| 数据库 | Cloudflare D1 (SQLite) |
| 存储 | Cloudflare R2（图片/音频） |
| 认证 | Better Auth |

## 快速开始

### 前置要求

- Node.js 20+
- Cloudflare 账号（免费即可）
- 已安装 Wrangler：`npm i -g wrangler`

### 1. 克隆并安装

```bash
git clone https://github.com/ajiatuo/jiatuo-blog-serverless.git
cd jiatuo-blog-serverless
npm install
cd client && npm install && cd ..
```

### 2. 创建 D1 数据库和 R2 存储

```bash
# 登录 Cloudflare
wrangler login

# 创建 D1 数据库
wrangler d1 create jiatuo-blog
# 把返回的 database_id 填入 wrangler.toml

# 创建 R2 存储桶
wrangler r2 bucket create jiatuo-blog-media
```

### 3. 初始化数据库

```bash
npm run db:migrate:local   # 本地开发用
npm run db:migrate:remote  # 线上用
```

### 4. 本地开发

```bash
npm run dev
# 访问 http://localhost:8787
```

### 5. 部署

```bash
npm run build
npm run deploy
```

详细步骤见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

### 6. 创建管理员

首次访问部署后的网站，用初始化令牌创建管理员账号：

```bash
# 获取初始化令牌
wrangler d1 execute jiatuo-blog --remote \
  --command "SELECT value FROM settings WHERE key='setupToken'"
```

访问 `https://你的域名/setup?token=xxx` 完成管理员创建。

## 项目结构

```
├── client/          # React 前端
│   └── src/
│       ├── components/  # 页面组件
│       └── ...
├── src/             # Worker 后端 (Hono)
│   ├── app.ts       # 路由入口
│   ├── auth.ts      # 认证
│   └── ...
├── shared/          # 前后端共享类型
├── migrations/      # D1 数据库迁移
└── wrangler.toml    # Cloudflare 配置
```

## 和原版的区别

| | 原版 momo-blog | 本项目 |
|---|---|---|
| 后端 | Express (需服务器) | Cloudflare Workers (无服务器) |
| 数据库 | SQLite 文件 | Cloudflare D1 |
| 文件存储 | 本地磁盘 | Cloudflare R2 |
| 部署 | 需 VPS/服务器 | `wrangler deploy` 一键 |

## 开源协议

MIT，见 [LICENSE](./LICENSE)。

原项目版权归 [snowhejia](https://github.com/snowhejia/momo-blog) 所有，
无服务器移植部分由本项目维护者贡献。
