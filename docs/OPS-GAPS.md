# OPS 缺口清单（真收款生产级）

**整体生产级＝否**（截至本文件维护时）：仓库内支付骨架与读门可验收，但下列外部项未齐时不得对真实用户收 19.9 元／年。

审计基线 SHA：`49514a05`（main，已合 PR #7）；本清单与 `docs/PAY_GO_LIVE.md` 互补——GO_LIVE 讲怎么做，本文只列**仍缺什么、谁提供、如何验收**。

Workflow 触发说明见 `docs/GITHUB-ACTIONS.md`。

---

## 指挥官待办（汇总，未验收勿宣称生产级）

| # | 事项 | 谁做 | 验收 |
|---|------|------|------|
| 1 | 微信 Native 商户全套 + 平台证书 | 商户主体 | `GET /health` → `wechat.ready` ∧ `wechat.notifyReady` |
| 2 | 支付宝当面付密钥对 | 商户主体 | `/health` → `alipay.ready` |
| 3 | 公网 HTTPS `NOTIFY_BASE_URL`（notify 可达） | 运维／域名 | `curl -sS https://<pay>/health` JSON；`notifyBaseConfigured: true` |
| 4 | 生产 `server/pay/.env`（不进 git，`devSimulate=false`） | 运维 | `productionGuardsOk=true`；未开 `*_NOTIFY_TRUST_UNSIGNED` |
| 5 | `PAY_CORS_ORIGINS` = 静态站真实 origin | 运维 + 前端 | 浏览器 `POST /create` 无 CORS 错误 |
| 6 | 仓库变量 `VITE_PAY_API`（与 pay 同源，无尾斜杠） | 仓库管理员 | Pages／构建产物 `isPayConfigured()` 为 true；解锁页有扫码按钮 |
| 7 | `.pay-data` 持久卷 + 备份 + 恢复演练 | 运维 | 还原后订单与 entitlement 可查 |
| 8 | Nginx 样例（限流 + 挡 `/dev/`） | 运维 | 公网不可访问 `/dev/simulate-paid` |
| 9 | 真机试单 → notify → paid → claim | 产品／运维 | 订单 paid；`/auth/me` 有 entitlement；换设备同邮箱可读 |
| 10 | **Pages 源对齐 Actions** + 成功 dispatch | 仓库管理员 | **已验收** run 37650307576 @ `1a69257`；见 R-PAGES 成功证据（可选 `VITE_PAY_API` 仍属收款） |

本地门禁（防误判，**≠** 生产级）：

```bash
PAY_API=https://<pay-origin> npm run pay:prod-health
```

`npm run pay:smoke` / `PAY_DEV_SIMULATE=1` **不得**当作生产过关。

---

## R-OPS — 公网收款与运维

| 缺口 | 谁提供 | 验收标准 |
|------|--------|----------|
| 公网 HTTPS `NOTIFY_BASE_URL`（微信／支付宝能 POST notify） | 运维／域名 | `curl -sS https://<pay>/health` 返回 JSON；`notifyBaseConfigured: true` |
| 微信 Native 商户材料（AppId、商户号、APIv3 密钥、证书序列号、商户私钥、平台证书） | 商户主体 | `/health` 中 `wechat.ready` 与 `wechat.notifyReady` 为 true |
| 支付宝当面付材料（AppId、应用私钥、支付宝公钥） | 商户主体 | `/health` 中 `alipay.ready` 为 true |
| 生产 `server/pay/.env`（**不进 git**） | 运维 | `devSimulate=false`；未开 `*_NOTIFY_TRUST_UNSIGNED`；`productionGuardsOk=true` |
| `PAY_CORS_ORIGINS` 与静态站真实 origin 一致 | 运维 + 前端发布 | 浏览器从静态站调用 `POST /create` 无 CORS 错误 |
| GitHub Actions 变量 `VITE_PAY_API`（与 pay 同源，无尾斜杠） | 仓库管理员 | Pages／静态构建产物中 `isPayConfigured()` 为 true；解锁页出现扫码按钮 |
| `.pay-data` 持久卷 + 备份 + 恢复演练 | 运维 | 从备份还原后订单与账号 entitlement 可查 |
| Nginx 样例套用（限流 + 挡 `/dev/`） | 运维 | 公网无法访问 `/dev/simulate-paid` |
| 真机试单（0.01 或 19.9）notify → paid → 登录 claim | 产品／运维 | 订单变 paid；`/auth/me` 有 entitlement；换设备同邮箱可读 |

---

## R-PAGES — 静态站部署

| 缺口 | 谁提供 | 验收标准 |
|------|--------|----------|
| GitHub Pages **Source 切到 GitHub Actions**（与 `github-pages.yml` 一致） | 仓库管理员 | Settings → Pages 不再使用 legacy `gh-pages` 分支源 |
| `workflow_dispatch` 跑 `.github/workflows/github-pages.yml` 成功 | 仓库管理员 | run `conclusion: success`，`head_sha` = 目标 commit |
| Actions 计费／runner 可用 | 组织账单 | build job 有 runner（非长期 `queued`、无步骤日志、`runner_id≠0`） |
| 可选：`vars.VITE_PAY_API` 在 Pages 构建时注入 | 仓库管理员 | 线上解锁页可下单（仍依赖 R-OPS） |

### 基线 SHA `49514a05` 上的 Pages 证据（2026-10-07）

| 项 | 值 |
|----|-----|
| 目标 commit | `49514a05b404be765d19aacaf41f56e15193bd3b` |
| Workflow run | [37644092023](https://github.com/kamanager2012/chengyu-storybook/actions/runs/37644092023)（`workflow_dispatch`，actor: `kamanager2012`） |
| `head_sha` | `49514a05…`（与目标一致） |
| 当时 `status` | `queued`（`jobs: []`，超时仍无 runner） |
| Cloud Agent dispatch | **403** `Resource not accessible by integration`（集成 token 无 workflow dispatch 权限） |
| Legacy 部署 | 内置 `pages-build-deployment` 在 **gh-pages** 上仍有 **success**（例 run 35433020851），与 Actions workflow **源不一致** |

**根因（推断，与历史 SHA `1ce95c0` 一致）：** Pages 未切到 **GitHub Actions** 源和／或组织 **无可用 runner 配额** → `github-pages.yml` 长期 `queued` 或秒失败；**不是** `npm run build` 编译问题（本地 `GITHUB_PAGES=1 npm run build` 可通过）。

**本仓策略：** 已去掉 `push: main` 触发，仅 `workflow_dispatch`；合并后由管理员在 UI dispatch，并先对齐 Pages Source。


### 成功证据 SHA `1a69257`（2026-10-08 SGT）

| 项 | 值 |
|----|-----|
| 目标 commit | `1a69257724fe96cd5eb77fcfff9489063a5b3e4c`（main，含 PR#7/#8） |
| Actions | `enabled=true`，`allowed_actions=all`；`default_workflow_permissions=write` |
| Pages Source | `build_type=workflow`（已非 legacy/gh-pages） |
| Workflow run | [37650307576](https://github.com/kamanager2012/chengyu-storybook/actions/runs/37650307576)（唯一一次 `workflow_dispatch`） |
| `head_sha` | `1a69257…` |
| `conclusion` | **success**（build + deploy） |
| page_url | https://kamanager2012.github.io/chengyu-storybook/ （抽检 HTTP 200；执行器 Playwright 冒烟 PASS） |
| 本地预检 | `GITHUB_PAGES=1 npm run build` PASS；`npm test` 140 pass／0 fail；`typecheck` PASS |
| 旧卡住 run | [37644092023](https://github.com/kamanager2012/chengyu-storybook/actions/runs/37644092023) 长期 queued、`jobs:[]`；根因为当时 `actions/permissions.enabled=false`；启用后仍无法 API cancel，但未起 runner |

**本仓策略（保持）：** `github-pages.yml` 仅 `workflow_dispatch`；勿恢复 `push: main`。

**待办 #10 状态：** Pages 源对齐 + 成功 dispatch **已验收**（仍缺可选 `vars.VITE_PAY_API`，属收款轨）。


---

## R-READGATE — 产品门禁（代码侧）

| 项 | 状态 |
|----|------|
| `content/commerce.json` → `readGateEnabled: true` | 代码已恢复（勿在无 pay 时长期关读门） |
| 未权益仅可读 `freeStoryIds`（12 本） | `npm test` → `commerce-entitlement.test.mjs`；E2E `e2e/read-gate.spec.ts`、`e2e/catalog-pages.spec.ts` |
| `VITE_PAY_API` 空时诚实文案 | `/unlock`（`data-pay-pending`）、`/story/$id` 锁页 |

读门开 + pay 未接 ＝ **可试看 12、其余挡读、暂时买不了**（预期，非生产级）。

---

## 改判「整体生产级＝是」须同时

1. 指挥官待办表 R-OPS（上表）全部验收行通过（含真单闭环）。
2. R-PAGES：Pages Source = Actions，且至少一次 `github-pages.yml` 成功部署（含目标 SHA）。
3. 读门开 + pay 配通 + 文档与 `commerce.json` 无关键漂移。
