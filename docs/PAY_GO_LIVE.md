# 收款上线清单（成语绘本）

定位与竞品对照见 `docs/competitors.md`。


站可以后挂；本清单只把 `server/pay` 推到可收 19.9 元／年的状态。

## 已在仓内就绪

- 定价与通道：`content/commerce.json`（19.9 元、微信+支付宝、`readGateEnabled: true`）
- 扫码下单／异步 notify／邮箱账号／claim：`server/pay`
- 契约测试：`npm run pay:test`（本地 12/12 PASS）
- 部署样例：`server/pay/deploy/`（Dockerfile、compose、systemd、nginx）

## 你必须提供（不进 git）

1. **公网 HTTPS 源** `NOTIFY_BASE_URL`（例：`https://pay.example.com`）  
   微信／支付宝异步通知要能 POST 到  
   `{NOTIFY_BASE_URL}/notify/wechat` 与 `{NOTIFY_BASE_URL}/notify/alipay`。
2. **微信 Native**：AppId、商户号、APIv3 密钥（32 位）、证书序列号、商户私钥 PEM、平台证书 PEM。
3. **支付宝当面付预下单**：应用 AppId、应用私钥、支付宝公钥。
4. **CORS**：`PAY_CORS_ORIGINS` 写成以后静态站的真实 origin（暂无站可先填预览 origin）。
5. 前端构建变量：`VITE_PAY_API=<NOTIFY_BASE_URL>`（下次挂站构建时写入）。

把以上写入机器上的 `server/pay/.env`（参考 `server/pay/env.example`），**不要 commit**。

## 推荐部署（二选一）

### A. Docker

```bash
# 在已填好 server/pay/.env 的机器上
docker compose -f server/pay/deploy/docker-compose.yml --env-file server/pay/.env up -d --build
curl -s https://pay.example.com/health
```

### B. systemd + nginx

```bash
sudo cp -a . /opt/chengyu-storybook
sudo cp server/pay/deploy/chengyu-pay.service /etc/systemd/system/
# 编辑 EnvironmentFile 路径与 nginx 站点后：
sudo systemctl daemon-reload && sudo systemctl enable --now chengyu-pay
```

## 验收

1. `GET /health`：`wechat.ready` / `alipay.ready`（及微信 `notifyReady`）为 true，`devSimulate` 为 false。
2. 真机扫码付 0.01 元试单（若商户支持）或 19.9 元一笔，确认 notify 到账、`/order` 变 `paid`、`/claim` 写出权益。
3. 邮箱注册 → 登录 → 解锁 → 换设备同邮箱仍有效。

## 本机模拟（无商户）

```bash
# 终端1
npm run pay:dev
# 终端2（另开）
npm run pay:smoke
```

`pay:smoke`：注册 → 微信下单 → `simulate-paid` → claim → `/auth/me`。

## 刻意不做

- 不把商户密钥写进仓库或 GitHub Secrets（除非你另开私密托管并明确授权）。
- 不在 Actions 额度用尽时依赖 CI 部署支付。
- 静态站挂载另议；支付可先独立上线。

## 生产门禁（验收必过）

`GET /health` 在收真钱前必须同时满足：

| 字段 | 要求 |
|---|---|
| `devSimulate` | `false` |
| `claimRequiresAuth` | `true` |
| `wechatTrustUnsigned` / `alipayTrustUnsigned` | `false` |
| `productionUnsafe` | `false` |
| `productionGuardsOk` | `true` |

任一不满足：**不要**开放扫码收款。`PAY_DEV_SIMULATE=1` 或 `*_NOTIFY_TRUST_UNSIGNED=1` 等于可伪造到账。

### 生产 health 验收脚本（防误判）

只看 `productionGuardsOk` **不够**：还必须有公网 `notifyBaseConfigured` 与业务通道 ready。用脚本一次断言：

```bash
# 指向真实 pay 源（HTTPS）
PAY_API=https://pay.example.com npm run pay:prod-health

# 只要微信或只要支付宝时：
PAY_API=https://pay.example.com PAY_REQUIRE_CHANNELS=wechat npm run pay:prod-health
PAY_API=https://pay.example.com PAY_REQUIRE_CHANNELS=alipay npm run pay:prod-health
```

脚本会检查：`devSimulate=false`、`productionUnsafe=false`、`productionGuardsOk=true`、`claimRequiresAuth=true`、未开 `*TrustUnsigned`、`notifyBaseConfigured=true`，以及所选通道的 `wechatReady`∧`wechatNotifyReady` 和／或 `alipayReady`。缺任一项非 0 退出并打印缺项。

**本机模拟态应故意 FAIL**（不要当成生产 PASS）：

```bash
npm run pay:dev   # 终端1：PAY_DEV_SIMULATE=1
PAY_API=http://127.0.0.1:8787 npm run pay:prod-health   # 终端2：期望失败
```

该脚本是**代码侧防误判门禁**，通过 ≠ 宣称「真收款生产级＝是」（仍需真商户、公网回调与人工试单）。


## Claim／换设备

- 生产：`POST /claim` **必须**带邮箱登录后的 `Authorization: Bearer …`；匿名 claim 返回 401。
- 开发模拟：允许匿名 claim **一次**，再次匿名领取 409（防 orderId 洗权益）；登录后仍可把该单绑到账号。
- 静态站解锁页：须先注册／登录再付款；文案写明换设备靠同一邮箱，不靠本机缓存。

## CORS 与静态 origin

`PAY_CORS_ORIGINS` 必须写成**最终静态站真实 origin**（含预览站），与浏览器地址栏一致、无尾斜杠，逗号分隔。例：

```bash
PAY_CORS_ORIGINS=https://stories.example.com,https://kamanager2012.github.io
```

前端构建变量（**不要**把商户密钥写进 Actions）：

```bash
# GitHub Actions: Settings → Secrets and variables → Actions → Variables
# 名称 VITE_PAY_API，值 https://pay.example.com（与 NOTIFY_BASE_URL 同 origin）
VITE_PAY_API=https://pay.example.com
```

Pages workflow 已从 `vars.VITE_PAY_API` 注入；变量未配置时构建出的站无法下单（解锁页提示通道未开放），属预期。

## 数据备份（.pay-data）

订单与账号默认在 `server/pay/.pay-data/`（Docker volume `pay-data`）。上线后请每日备份该目录或卷，例如：

```bash
# 主机 cron 示例：把 volume 挂载点打成 tar
tar -czf /backup/chengyu-pay-$(date +%F).tgz /var/lib/docker/volumes/<project>_pay-data/_data
```

丢失该目录等于丢订单与邮箱权益绑定。

