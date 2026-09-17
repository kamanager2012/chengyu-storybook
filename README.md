# 成语故事 · Chinese Idiom Storybook

面向儿童的中文成语绘本。当前运行时无需账号即可翻阅 **100 个成语、两套画风**（儿童馆 100 本，古风馆 100 本）：每本封面 + 7 个故事页 + 道理页。儿童水彩在 `public/stories/`（前 24 本）和 `content/imagine-child-drafts/`（已齐的重绘，运行时 `/child-stories/`），前 24 本的工笔古风源稿在 `content/imagine-gongbi/`，运行时同步为 JPEG `/classic-stories/`，旁白在 `public/audio/`。旁白资产使用独立的生成、校验与 provenance 流水线；前端不会仅因为 MP3 文件存在就开放播放。

仓库已经收敛为一个 **local-first、静态部署的 Web/PWA 绘本**。阅读、翻页和本地状态都在浏览器侧完成，不需要应用服务器。

## 当前能力

- 100 个正式成语，儿童馆与古风馆两套画风；同一 id 用 `?hall=` 选图
- 每本 8 张插图（封面 + p1–p7）与 9 轨旁白（封面、7 个故事页、道理页）
- 成语释义与儿童友好的“小道理”总结
- 阅读器在旁白通过 runtime availability 后提供点播；未点播前不加载音频
- 移动端安全区、键盘焦点与触控分页体验
- 标准静态 Web App Manifest，含 192/512 PNG 与 maskable 安装图标
- 产品自有离线 app shell；已访问故事图片可在断网后继续显示
- canonical 内容源、资产完整性报告、source lineage、release provenance 与旁白状态流水线

## 架构

```text
content/published-stories.json
        │ 100 个正式图文故事（canonical 文本与 7 段正文）
        │
        ├──── scripts/story-model.mjs
        │         │
        │         ├─ content/report/narration gates
        │         └─ full published runtime adapter
        │
        ↓
scripts/runtime-story-index.mjs
        ↓ build-time metadata only
 Vite define(__STORY_INDEX__)
        ↓
 src/data/story-index.ts
        ↓
    Homepage shelf

Full story routes:
content/published-stories.json
        ↓
src/data/stories.ts
        ↓
/story/$id → IllustratedStoryReader
```

首页只需要书架 metadata，因此不会再为了渲染 100 张卡片主动加载所有故事正文、释义、道理、分段或页面结构。完整正文仍由故事路由使用的 full-body runtime adapter 提供。`scripts/runtime-story-index.mjs` 是 canonical 数据的派生视图，不是新的内容真源。

`content/story-drafts/*.json` 是晋升前的历史文本快照，不再是 live catalog。`scripts/draft-story-catalog.mjs` 对运行时返回空目录。`content/imagine-drafts/` 仍是插图权利证据的来源档案，不是上架路径。

默认主链不包含登录、数据库、SSR、API server 或第三方 Builder runtime。只有未来出现明确的跨设备账号/同步需求时，才重新评估服务端能力。

## 内容真源

仓库不存在“`src/data/stories.ts` 是唯一真源”这一规则。

```text
content/published-stories.json
```

是 **100 个正式图文故事**的 canonical 文本与页面结构来源。`scripts/story-model.mjs` 直接解析它，并向内容检查、报告、旁白计划/生成等工具提供同一套 story/page/text 事实。

Runtime 层分成两种派生视图：

- `src/data/stories.ts`：100 个图文故事的完整浏览器结构与静态媒体路径；
- `src/data/story-catalog.ts`：已退役的草稿/待配图适配器，当前必须保持为空；
- `scripts/runtime-story-index.mjs`：从 canonical 数据构建书架 metadata；
- `src/data/story-index.ts`：接收 Vite 注入的 `__STORY_INDEX__`，只服务首页书架。

不要在 runtime adapter、生成器、迁移脚本或测试里复制出另一份故事正文真源。

## Active Reader

当前 `/story/$id` 只使用 `IllustratedStoryReader` 阅读正式图文故事。`DraftStoryReader` 仅作为空草稿目录的残留回退，不得再为已晋升绘本加载 `/draft-stories/` 或跳过旁白门禁。

历史 `StoryReader`、字符级启发式高亮、WebAudio 背景音乐、旧 listening progress/settings 状态机已经从 active source tree 删除。不要把旧播放器整套复活；旁白只通过当前 `IllustratedStoryReader` 上经过 release gate 的 verified narration controller 暴露。

## 开发

要求 Node.js 20.19+。

```bash
npm ci
npm run deps:inventory
npm run typecheck
npm run lint -- --max-warnings=0
npm test
# Optional legacy Kokoro narration pipeline (not the live Eve voice gate):
# npm run test:kokoro
# child-draft inventory asserts only when local content/imagine-child-drafts/logs exists (gitignored).
npm run content:check
npm run source:check
npm run provenance:check
npm run build
npm run dev
```

默认开发地址为 `http://localhost:8080`，构建产物位于 `dist/`。

涉及路由、阅读器 UI、媒体加载、响应式布局、PWA/offline 或静态部署行为时，再运行产品级浏览器回归：

```bash
npx playwright install chromium
npm run test:e2e
```

E2E 会在桌面与移动 Chromium 上验证真实书架链接、故事深链、媒体请求边界、阅读行为、离线 shell、浏览器错误以及基础横向溢出。旁白只在用户点击播放后加载；E2E 也会防止旧 listening 状态或旧播放器绕过发布边界。

## CI 边界

默认 `npm test` 对齐现网旁白口径（Eve／Grok TTS）。历史 Kokoro 生成／provenance 合同在 `npm run test:kokoro`，不作为干净树默认门禁，避免假绿。

同仓库的 `main`、`feat/**`、`fix/**`、`chore/**`、`perf/**`、`generated/**` push 由 `.github/workflows/exact-head-ci.yml` 作为权威 gate：

- Node 20 / Node 22；
- zero-warning lint；
- 完整 `npm run check`；
- dependency audit；
- Chromium desktop/mobile E2E；
- 最终发布机器可读的 `exact-head-ci` commit status。

Chromium E2E 失败时，CI 只在失败路径上传 `test-results/`，用于保留 Playwright trace、截图和 video 诊断证据。第三方 Actions 必须固定到 immutable commit SHA。

同一分支的新 SHA 会取消旧的 exact-head run，减少过期状态和重复执行。`storybook-ci.yml` 与 `storybook-e2e.yml` 只保留为 **fork pull request 的只读验证**，避免同仓库 PR 在 push gate 之外再重复跑一套相同 CI。

## 静态部署

可部署到任何能够托管静态文件的服务。因为 `/story/$id` 是客户端路由，生产环境必须把未知页面请求回退到 `index.html`，否则直接打开故事深链会得到 404。

PWA 元数据位于 `public/manifest.webmanifest`，离线 shell 位于 `public/sw.js`，都不依赖服务端动态注入。Manifest 与 HTML 使用相对路径 / `%BASE_URL%`，以便 GitHub Pages 等非根路径部署。

### 离线边界

当前离线能力刻意保持克制：

- 安装后的 app shell 与构建静态资源会缓存；
- 在线访问过的故事图片会按需进入运行时缓存；
- 断网后仍可打开首页和已经访问过、图片已缓存的故事页面；
- `/audio/*` 与 HTTP Range 请求不会自动缓存，因此当前不承诺断网旁白播放。

音频体积较大，而且浏览器可能使用分段 Range 请求。未来如果要提供“整本下载后离线听”，应单独设计下载、容量、更新和清理机制，而不是把所有 MP3 隐式塞进 service-worker cache。

## 内容模型与生产链

静态媒体位于：

```text
public/stories/<story-id>/...
public/audio/<story-id>/...
```

常用内容命令：

```bash
# 严格检查 manifest、图片/MP3 签名、缺失资产和 orphan 资产
npm run content:check

# 输出确定性的机器可读报告
npm run content:report

# 查看旁白相对当前正文的 current/stale/unverified/missing 状态
npm run narration:plan

# 检查 provenance 结构、stale/invalid claim
npm run provenance:check

# 公开/内容发布前的 fail-closed release gate
npm run release:check
```

`content/narration-state.json` 只记录通过当前 pipeline 生成或验证过的旁白。历史 MP3 如果没有匹配的 text/audio SHA-256 记录，只能标记为 `unverified`，不能因为文件存在就宣称“与当前正文一致”。

### 旁白生成与激活

旁白生产必须走受保护的 provider/runtime/encoder 合同与 receipt 导入流程，并保持范围显式、失败关闭。已经验证并绑定证据的旁白不得被宽泛的全量替换命令静默覆盖。

旁白的 **技术 current** 与 **发布可用** 是两个条件：

```text
text/audio hashes current
        +
release provenance satisfied
        ↓
runtime availability
        ↓
reader playback UI
```

因此前端不得通过 `public/audio` 下“文件存在”来推断可播放状态。

## 工程边界

- 不让 Better Auth / PostgreSQL / PGlite / TanStack Start / Nitro 等未使用基础设施进入默认主链；
- 不提交 Vercel 构建输出、临时 artifacts、截图目录或本地 Builder 状态；
- 保留真正服务于绘本体验的图片、音频和字体；
- import inventory、zero-warning lint、typecheck、tests、content gate、build、dependency audit 都属于交付 gate；
- 路由/阅读器/媒体/响应式/PWA/部署改动还必须通过产品级浏览器 E2E；
- 已删除的 legacy `StoryReader` / highlight / music / progress 状态机不得重新进入 active runtime；
- service-worker cache 只能清理本项目自己的 `chengyu-storybook-*` key；
- 大体积历史生成物若要清理，单独做经过审计的 Git history rewrite，不和产品开发混在一起。

## 内容与资产来源

项目中的故事文本、图片、音频和字体在扩大公开发布前，应逐项具备可复核的来源、授权或生成 provenance。仓库不会把“文件存在”当成“版权状态已确认”。
