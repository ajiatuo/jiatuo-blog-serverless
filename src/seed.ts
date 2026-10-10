// 种子数据（无服务器版）
// 对应原项目 server/seed.ts。无服务器版不带演示图片/音频（二进制素材需管理员自行上传），
// 只写入一份干净的默认首页内容，管理员登录后即可开始编辑。

import {
  contentSchema,
  DEFAULT_ABOUT_BODY,
  DEFAULT_LOCATION,
  type HomeContent,
} from "../shared/model.js";

export function defaultHomeContent(): HomeContent {
  const c = {
    theme: "fresh",
    location: { ...DEFAULT_LOCATION },
    profile: {
      name: "我的小站",
      avatarId: null,
      headline: "把作品、文字和日常放在一起。",
      introduction: "你好，这是我的个人主页。",
      description: "记录想法、作品与生活碎片的地方。",
      aboutBody: DEFAULT_ABOUT_BODY,
      eyebrow: "你好",
      motto: "慢慢来，也是一种速度。",
    },
    social: {
      github: "",
      xiaohongshu: "",
      bilibili: "",
      youtube: "",
      email: "",
    },
    projects: [],
    articles: [],
    photos: [],
    collections: [],
    friends: [],
    tracks: [],
  };
  return contentSchema.parse(c);
}
