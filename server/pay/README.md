# 成语绘本收款服务

全年册定价读自仓库根目录 `content/commerce.json`（当前 19.9 元 / 1990 分）。

**付款方式：扫码。**  
微信走 Native（`code_url`），支付宝走当面付预下单（`qr_code`）。前端本地画出二维码；用户用对应 App 扫一扫即可。手机浏览器也能下单，但用另一台设备扫更顺手。

**跨设备：** 用户用**邮箱**注册账号（不做微信登录）→ 登录后付款（或付款后再登录点领取）→ 权益写入服务端账号。换设备登录同一邮箱，书架会从 `/auth/me` 拉回全年册。

开通链路：下单 → 扫码付款 → **异步 notify 验签**（或轮询时主动查单）把订单标 `paid` → 前端 `/claim`（带登录态则绑定账号）→ 本机 + 云端权益。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查与通道配置状态 |
| POST | `/auth/register` | `{ email, password }` → session token（也兼容 `loginId`） |
| POST | `/auth/login` | `{ email, password }` → session token |
| POST | `/auth/logout` | Bearer 注销 |
| GET | `/auth/me` | Bearer → 账号 + 云端 entitlement |
| POST | `/create` | body: `{ productId, channel, amountFen }`；可带 Bearer 预绑账号 |
| GET | `/order/:orderId` | 查单；pending 时会顺带向微信/支付宝主动查询是否已付 |
| POST | `/notify/wechat` | 微信异步通知（平台证书验签 + APIv3 解密） |
| POST | `/notify/alipay` | 支付宝异步通知（RSA2 验签） |
| POST | `/claim` | body: `{ orderId }`；带 Bearer 时把权益绑到账号（一单一账号） |
| POST | `/dev/simulate-paid/:orderId` | 仅 `PAY_DEV_SIMULATE=1` 时可用 |

## 本地开发（无商户密钥）

```bash
cp server/pay/env.example server/pay/.env
# PAY_DEV_SIMULATE=1
# PAY_CORS_ORIGINS=http://127.0.0.1:8080,http://localhost:8080
# NOTIFY_BASE_URL=http://127.0.0.1:8787

set -a && source server/pay/.env && set +a
npm run pay:dev
```

前端 `.env.local`：

```bash
VITE_PAY_API=http://127.0.0.1:8787
```

打开 `/unlock` → 选微信或支付宝 → 会出现示意二维码。模拟到账：

```bash
curl -X POST http://127.0.0.1:8787/dev/simulate-paid/<orderId>
```

## 正式商户（两边都是扫码）

需要的材料（**不要进 git**）：

| 通道 | 材料 | 下单接口 |
|---|---|---|
| 微信 | AppId、商户号、APIv3 密钥、商户证书序列号、商户私钥、**平台证书** | `/v3/pay/transactions/native` |
| 支付宝 | 应用 AppId、应用私钥、支付宝公钥 | `alipay.trade.precreate` |
| 共用 | 公网 HTTPS `NOTIFY_BASE_URL`（微信/支付宝都能 POST 到） | |

`PAY_DEV_SIMULATE=0`，配齐 `server/pay/.env`，重启服务，前端设好 `VITE_PAY_API`。

### 生产注意

- 用户扫码后：优先靠异步回调记账；前端每 2s 轮询 `/order`，服务端会再主动查一次通道，减轻漏回调。
- 微信 notify：`WECHAT_PLATFORM_CERT` + 32 位 `WECHAT_APIV3_KEY`；缺一不可，否则非开发模式返回 501。
- 支付宝 notify：RSA2 验签；公钥可写完整 PEM，也可只贴裸 base64。
- 订单默认 `server/pay/.pay-data/orders.json`，账号在同目录 `accounts.json`（已 gitignore）。上线请换持久存储。
- 密码用 scrypt；会话 token 只存哈希，约 400 天有效。
- 配通并实测成功后，再考虑 `content/commerce.json` 的 `readGateEnabled: true`。

## 生产部署样例

见 `server/pay/deploy/`（Dockerfile / compose / systemd / nginx）与仓库根 `docs/PAY_GO_LIVE.md`。

`readGateEnabled` 已在 `content/commerce.json` 打开；无公网支付时前端解锁会失败，免费 12 本仍可读。

## npm

```bash
npm run pay:dev    # PAY_DEV_SIMULATE=1 启动
npm run pay:test   # 契约 + 验签测试
```
