# 部署指南

从零开始，把 jiatuo-blog-serverless 部署到 Cloudflare。

## 准备工作

1. 注册 [Cloudflare](https://dash.cloudflare.com/sign-up) 账号（免费）
2. 安装 Node.js 20+（[官网下载](https://nodejs.org/)）
3. 准备一个域名（可选，Cloudflare 会送一个 `*.workers.dev` 免费域名）

## 步骤 1：安装 Wrangler

```bash
npm install -g wrangler
```

## 步骤 2：登录 Cloudflare

```bash
wrangler login
```

浏览器会打开授权页面，点 Allow。

## 步骤 3：克隆项目

```bash
git clone https://github.com/ajiatuo/jiatuo-blog-serverless.git
cd jiatuo-blog-serverless
npm install
```

## 步骤 4：创建 D1 数据库

```bash
wrangler d1 create jiatuo-blog
```

输出类似：

```
✅ Successfully created DB 'jiatuo-blog'

[[d1_databases]]
binding = "DB"
database_name = "jiatuo-blog"
database_id = "xxxx-xxxx-xxxx-xxxx"
```

把 `database_id` 复制到 `wrangler.toml` 的 `database_id` 字段。

## 步骤 5：创建 R2 存储桶

```bash
wrangler r2 bucket create jiatuo-blog-media
```

`wrangler.toml` 里已经配好了 `bucket_name = "jiatuo-blog-media"`，不用改。

## 步骤 6：初始化数据库表

```bash
npm run db:migrate:remote
```

## 步骤 7：设置密钥

```bash
# 认证密钥（随机字符串，越长越好）
wrangler secret put AUTH_SECRET
# 粘贴一个随机字符串，如：openssl rand -base64 32 的输出
```

## 步骤 8：构建并部署

```bash
npm run build
npm run deploy
```

部署成功后会显示：

```
Published jiatuo-blog-serverless (https://jiatuo-blog-serverless.你的账号.workers.dev)
```

## 步骤 9：创建管理员账号

```bash
# 查初始化令牌
wrangler d1 execute jiatuo-blog --remote \
  --command "SELECT value FROM settings WHERE key='setupToken'"
```

访问 `https://你的域名/setup?token=查到的token`，设置管理员邮箱和密码。

> ⚠️ 初始化令牌只能用一次，用完即作废。

## 步骤 10：绑定自定义域名（可选）

1. 在 Cloudflare Dashboard → Workers → 你的 Worker → Settings → Domains
2. 点 Add Custom Domain，输入你的域名
3. 按提示去域名 DNS 处添加 CNAME 记录

## 本地开发

```bash
# 初始化本地数据库
npm run db:migrate:local

# 启动开发服务器
npm run dev
# 访问 http://localhost:8787
```

## 常见问题

### 部署后访问 404？

检查 `wrangler.toml` 的 `[assets]` 配置，确保 `binding = "ASSETS"` 已设置。

### 图片/音频上传失败？

检查 R2 存储桶名称是否和 `wrangler.toml` 一致，Worker 是否有 R2 读写权限。

### 登录后提示"请求来源无效"？

`wrangler.toml` 的 `APP_URL` 必须和实际访问域名一致，改完后重新 `wrangler deploy`。

## 费用说明

Cloudflare 免费额度（2026年标准）：

| 资源 | 免费额度 | 个人博客够用吗 |
|------|----------|---------------|
| Workers 请求 | 10万次/天 | ✅ 完全够用 |
| D1 读取 | 500万行/天 | ✅ 够用 |
| D1 写入 | 10万行/天 | ✅ 够用 |
| R2 存储 | 10GB | ✅ 够用 |
| R2 流出 | 免费（无出口费）| ✅ |

超出后按量付费，个人博客基本不会超。
