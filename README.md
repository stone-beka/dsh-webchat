# dsh-webchat

把 **DeepSeek 官方网页版聊天**搬进 [DSH](https://github.com/deepseek-ai) 的主栏：本机托管官方 `chat-demo` 构建，用你自己的 API Key 直连 `api.deepseek.com`，并补上了分支图谱、置顶、搜索、多选、导出这些网页端习惯的功能。

> English: DeepSeek's official web chat, embedded in DSH as a main-column panel and driven by your own API key — plus a branch map, chat search, pinning with manual order, multi-select and export. Nothing is proxied; the key and the chats stay in the page's own origin.

## 安全边界

- **不同源**：页面跑在 `127.0.0.1:43117`，与 DSH 的 GUI 是不同 origin，页面里的脚本读不到 GUI 的会话凭据，也调不动 DSH 自己的 `/api`。
- **Key 不出这个页面**：API Key 只存在该页面自己的浏览器存储里，不经过插件 Host、不进 DSH 会话、不上传给任何第三方。
- **Host 只读文件**：Host 侧只做本地静态文件读取，不代发请求、不记录聊天内容；聊天记录只在本机 IndexedDB。
- **无工具、无副作用**：没有工具调用、没有文件读写、没有命令执行，不会在你磁盘上动手，也不会在 DSH 里留下状态。

## 功能

**和网页版一致的**：深度思考 / 智能搜索、文件与图片上传、语音输入、朗读（音色可选）、编辑上一条、重新生成、版本切换（`1/3`）、思考过程折叠、复制、会话分组、重命名、删除、导入官方导出、导出全部、删除全部。

**这个插件补的**：

| 功能 | 说明 |
|---|---|
| 分支图谱 | 会话右上角树状按钮：把会话画成「时间向下、分支向右」的树。点任意卡片跳到该消息、虚实线区分当前/放弃分支、Ctrl+滚轮缩放、拖动平移、右下小地图、拖左缘改宽 |
| 置顶 | 会话 `⋯` → 置顶/取消置顶；置顶组在最上面，且组内顺序可手动调（「排序」） |
| 搜索对话 | `Ctrl+K` 或侧栏放大镜；标题命中 + 消息命中（片段 + 角色），点一条跳到该消息（必要时先切回那条分支） |
| 多选 | 会话 `⋯` → 多选，批量删除 / 置顶 / 取消置顶，带全选与已选计数 |
| 导出分享 | 会话 `⋯` → 导出 Markdown / 单文件 HTML（官方是服务端分享链接，本机没有服务端，所以给文件） |
| 首次说明 / 帮助 | 第一次打开弹一次介绍；设置 → 通用设置里可再看，并附官方协议与隐私政策链接 |

## 安装

插件以「本地 bundle」方式安装：DSH 的 profile 会把它当作一个包加载。

```powershell
# 1) 把仓库放在任意位置，例如
#    C:\dsh-plugins\dsh-webchat

# 2) 在你的 profile 目录（例如 %USERPROFILE%\.dsh\profiles\desktop）
#    的 package.json 里加一条依赖，然后安装
#    "dependencies": { "dsh-webchat": "link:C:/dsh-plugins/dsh-webchat" }
pnpm install

# 3) 把包名加进同一个 package.json 的 dsh.profile.bundles
#    "bundles": [ ..., "dsh-webchat" ]

# 4) 重启 DSH（bundle 图在启动时构建），左侧栏就会出现入口
```

端口默认 `43117`，被占用时把 `index.js` 的 `PORT` 与 `client.js` 的 `SOURCE` 一起改掉。

## 数据放在哪

- 会话：`http://127.0.0.1:43117` 这个 origin 下的 IndexedDB。
- 设置与 API Key：同一 origin 的 localStorage（`chat-demo:api-key` 等）。
- 置顶顺序：`chat-demo:pin-order`（localStorage，不进官方导出格式）。
- DSH 侧不保存任何聊天内容；DSH 的会话列表里也不会出现这里的会话。

## 构建

`dist/` 是已经构建好的产物，直接可用。要改页面本身时：

```powershell
cd app
pnpm install
$env:NODE_ENV = 'production'
node -e "require('fs').rmSync('dist',{recursive:true,force:true})"   # 官方脚本用的 rm -rf 在 Windows 下不可用
pnpm exec rspack build -c rspack.config.ts
pnpm exec tsc -p tsconfig.json --noEmit                              # 可选：类型检查
Copy-Item dist\* ..\dist\ -Recurse -Force                            # 产物放回插件根目录
```

## 和官方 v0.1.1 的差异

见 [docs/fork-changes.md](docs/fork-changes.md)：标题与文案、首次跟随主题语言、置顶与 `pinned` 导入、分支图谱、搜索/多选/排序/导出/帮助。

## 已知限制

- **没有分享链接**：官方「创建分享链接」需要服务端托管与鉴权，本机实例只能导出文件。
- **没有账号体系**：头像、登录设备、未成年人模式、云端同步都不适用（你是用自己的 API Key）。
- **切换面板会重新加载**：面板是独立页面，切走即卸载；生成中切走会中断。
- **置顶顺序只在本机**：官方导出格式里没有这个字段，导出再导入会按时间重排。
- **搜索索引在内存**：刷新后第一次搜索会重读一遍本地会话（千级会话通常几秒，有进度提示）。

## 许可

本仓库的插件代码（`index.js` / `client.js` / `cordis.patch.yml` / `locale/` / `icon.svg`）以 MIT 发布，见 [LICENSE](LICENSE)。

`dist/` 与 `app/` 来自 [`deepseek-ai/chat-demo`](https://github.com/deepseek-ai/chat-demo) v0.1.1（MIT），上游许可随包保留（`dist/LICENSE`、`app/LICENSE`）。分支图谱等改动是在该源码上的 fork，同样以 MIT 提供。

本项目不是 DeepSeek 官方产品。
