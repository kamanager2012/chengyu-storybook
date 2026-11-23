# GitHub Actions 触发策略

组织偏好：**默认不自动烧 Actions**；重型或发布类 workflow 以 `workflow_dispatch` 为主。说明各 workflow 为何仍保留 PR 触发。

## 一览

| Workflow | 触发 | 说明 |
|----------|------|------|
| `github-pages.yml` | **仅** `workflow_dispatch` | 静态站发布；**禁止**恢复 `push: main` |
| `exact-head-ci.yml` | `pull_request` → `main`（`paths-ignore`: `docs/**`、`*.md`）+ `workflow_dispatch` | 同仓库合并 gate（Node 20/22、lint、check、audit、E2E、`exact-head-ci` status）；纯文档 PR 不烧；**不在** `main` push 上跑 |
| `story-image-origin-audit.yml` | `pull_request`（不限目标分支，仅当改动 `scripts/story-image-origin-audit.mjs`、`scripts/story-image-origin-audit-check.mjs`、本 workflow 文件、`public/stories/**`、`content/evidence/story-images/**` 之一时触发）+ `workflow_dispatch`；**不在** `push` 上跑 | 完整历史 checkout，重建历史 Imagine 插图来源映射并核对来源证据；`jpeg-js@0.4.4` 是钉死版本的审计专用解码器，只在 CI 里临时安装；权限 `contents: read`，超时 20 分钟 |
| `pages-build-deployment`（GitHub 内置） | legacy **gh-pages** 分支 | 与 `github-pages.yml` **互斥**；Settings 只能选一种 Pages 源 |

## GitHub Pages：Actions workflow vs legacy gh-pages

- **仓库 workflow**（`.github/workflows/github-pages.yml`）使用 `actions/deploy-pages`，要求 **Settings → Pages → Source: GitHub Actions**。
- **截至 2026-10-08：** Settings → Pages Source = **GitHub Actions**；最新成功证据 run [37659219416](https://github.com/kamanager2012/chengyu-storybook/actions/runs/37659219416)（`conclusion: success`，`head_sha`=`161d3ae`）；历史 [37650307576](https://github.com/kamanager2012/chengyu-storybook/actions/runs/37650307576) @ `1a69257`。
- 历史曾用内置 `pages-build-deployment`（`gh-pages` 分支）；与 Actions workflow **互斥**，勿切回 legacy。
- 发布：仓库管理员对目标 SHA 手动 **Run workflow**（`github-pages.yml` 仅 `workflow_dispatch`）。
- Cloud Agent / 集成 token 常 **无** `actions:write` 或 Pages 设置读权限，无法代发 dispatch；须指挥官在 GitHub UI 操作。

## 本地等价验证（≠ Pages 绿）

```bash
GITHUB_PAGES=1 npm run build
```
