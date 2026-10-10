# 更新日志

## v1.0.0 (2026-10-11)

首个开源版本：momo-blog 的 Cloudflare 无服务器移植版。

### 架构迁移
- 后端：Express → Cloudflare Workers + Hono
- 数据库：SQLite 文件 → Cloudflare D1
- 文件存储：本地磁盘 → Cloudflare R2
- 部署：需 VPS → `wrangler deploy` 一键部署

### 功能（博客版）
- Bento 风格个人空间，可视化编辑
- 音乐播放器（播放列表、睡眠定时、倍速）
- 10+ 套主题切换
- 管理员后台（内容管理、用户管理）
- 邮箱 2FA 登录保护
- 移动端/PC 自适应

### 与原版差异
- 移除了知识付费相关功能（冥想课程、VIP、微信支付），专注个人博客场景
- 需要付费版本请联系维护者

### 致谢
原项目 [snowhejia/momo-blog](https://github.com/snowhejia/momo-blog)（MIT）
