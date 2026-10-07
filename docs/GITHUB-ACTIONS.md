# GitHub Actions 触发策略

组织偏好：**默认不自动烧 Actions**；重型或发布类 workflow 以 `workflow_dispatch` 为主。本文件与 `docs/OPS-GAPS.md` 互补，说明各 workflow 为何仍保留 PR 触发。

## 一览

| Workflow | 触发 | 说明 |
|----------|------|------|
| `github-pages.yml` | **仅** `workflow_dispatch` | 静态站发布；**禁止**恢复 `push: main`（见 OPS-GAPS § R-PAGES） |
| `exact-head-ci.yml` | `pull_request` → `main`（`paths-ignore`: `docs/**`、`*.md`）+ `workflow_dispatch` | 同仓库合并 gate（Node 20/22、lint、check、audit、E2E、`exact-head-ci` status）；纯文档 PR 不烧；**不在** `main` push 上跑 |
| `storybook-ci.yml` | `pull_request`（path 过滤） | **仅 fork PR**（`head.repo != github.repository`） |
| `storybook-e2e.yml` | `pull_request`（path 过滤） | **仅 fork PR** |
| `kokoro-*.yml`、`narration-*.yml`（多数） | path 过滤 PR + 部分 `workflow_dispatch` | 旁白生产链；同仓库 PR 仅在触及相关路径时跑 |
| `kokoro-provider-audit.yml` | path 过滤 PR + `workflow_dispatch` | 上游 provider 资产审计 |
| `narration-production-expansion.yml` | `push` → `feat/narration-story-batch-expansion` | 受控生产分支；非 `main` |
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

未配置 `VITE_PAY_API` 时构建产物与 CI 一致：解锁页诚实提示通道未接入（预期，非生产级）。
