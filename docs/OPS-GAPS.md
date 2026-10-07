# OPS 缺口清单（真收款生产级）

**整体生产级＝否**（截至本文件维护时）：仓库内支付骨架与读门可验收，但下列外部项未齐时不得对真实用户收 19.9 元／年。

审计基线 SHA：`1ce95c0`（`readGateEnabled` 曾误关）；本清单与 `docs/PAY_GO_LIVE.md` 互补——GO_LIVE 讲怎么做，本文只列**仍缺什么、谁提供、如何验收**。

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

**脚本门禁（防误判，≠ 生产级）：**

```bash
PAY_API=https://<pay-origin> npm run pay:prod-health
```

---

## R-PAGES — 静态站部署

| 缺口 | 谁提供 | 验收标准 |
|------|--------|----------|
| GitHub Pages 环境启用（Settings → Pages → GitHub Actions） | 仓库管理员 | `workflow_dispatch` 跑 `.github/workflows/github-pages.yml` 成功 |
| Actions 计费／runner 可用 | 组织账单 | build job 有 runner（非 2s 空失败、`runner_id≠0`） |
| 可选：`vars.VITE_PAY_API` 在 Pages 构建时注入 | 仓库管理员 | 线上解锁页可下单（依赖 R-OPS） |

**历史根因（审计 SHA `1ce95c0`）：** Actions API 显示 `github-pages.yml` 多次 run 在 **~2–4s** 内 `build` 失败、`deploy` skipped；job 无步骤日志、`runner_id: 0`，与 **Pages 未启用／无 runner 配额** 一类基础设施问题一致，而非 `npm run build` 编译错误（本地 `GITHUB_PAGES=1 npm run build` 可通过）。

**本仓策略：** 已去掉 `push: main` 触发，仅 `workflow_dispatch`，避免 main 上连续失败 run；合并后由管理员手动 dispatch 验证。

---

## R-READGATE — 产品门禁（代码侧）

| 项 | 状态 |
|----|------|
| `content/commerce.json` → `readGateEnabled: true` | 代码已恢复（勿在无 pay 时长期关读门） |
| 未权益仅可读 `freeStoryIds`（12 本） | `npm test` → `commerce-entitlement.test.mjs`；E2E `e2e/read-gate.spec.ts` |
| `VITE_PAY_API` 空时诚实文案 | `/unlock`、`/story/$id` 锁页 |

读门开 + pay 未接 ＝ **可试看 12、其余挡读、暂时买不了**（预期，非生产级）。

---

## 改判「整体生产级＝是」须同时

1. 上表 R-OPS 全部验收行通过（含真单闭环）。
2. R-PAGES 至少一次成功静态部署（含目标 SHA）。
3. 读门开 + pay 配通 + 文档与 `commerce.json` 无关键漂移。

本地 `pay:smoke`／`pay:test`／`PAY_DEV_SIMULATE=1` **不得**写成生产过。
