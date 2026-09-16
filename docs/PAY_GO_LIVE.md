# 收款上线清单（成语绘本）

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
