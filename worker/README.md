# money GitHub OAuth API

這個 Worker 讓 GitHub Pages 前端透過 GitHub OAuth 登入，再由 Worker 代為讀寫本 Repository 的 `data/finance.json`。

## Cloudflare Worker 設定

建立 Worker 後，把 `worker/worker.js` 貼上。

設定環境變數：

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`（Secret）
- `FRONTEND_URL`：GitHub Pages 網址，例如 `https://harchun.github.io/money/`
- `CALLBACK_URL`：Worker OAuth callback，例如 `https://你的-worker.workers.dev/auth/callback`
- `GITHUB_OWNER`：`harchun`
- `GITHUB_REPO`：`money`
- `DATA_PATH`：`data/finance.json`
- `SESSION_SECRET`（Secret）：自行產生一串長隨機字串

## GitHub OAuth App

在 GitHub Developer Settings 建立 OAuth App：

- Homepage URL：GitHub Pages 網址
- Authorization callback URL：Worker 的 `/auth/callback`
- 建議使用 expiring user access tokens。

OAuth App 需要能存取 Repository；本專案只針對自己的 `harchun/money` 使用。

## 前端

部署 Worker 後，把 Worker 網址填到網站的「API 網址」，按「使用 GitHub 登入」。

注意：不要把 `GITHUB_CLIENT_SECRET` 或 `SESSION_SECRET` 寫進 Repository。
