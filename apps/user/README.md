# 上行宝用户端

这是上行宝内部版 0.1 的用户端前端，采用 uni-app + Vue 3 + TypeScript，目标平台为 H5 和微信小程序。

## 本地运行

```bash
npm install
npm run dev:h5
```

H5 默认访问 `http://localhost:5173`。微信小程序使用：

```bash
npm run dev:mp-weixin
```

生成的 `unpackage/dist/dev/mp-weixin` 目录可用微信开发者工具打开。

当前版本使用本地 Mock 数据，核心演示链路为：当前考试首页 → 章节刷题 → 作答反馈 → 知识点/课程/笔记入口。
