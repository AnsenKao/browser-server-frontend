# Browser Agent 前端控制台

這是一個針對 `browser-use` 後端 API（見 `browser-server-api.json`）打造的 React + Vite 前端介面，可用來：

- 透過對話指令建立瀏覽器任務 (`POST /agents/create`)
- 以 SSE (`GET /agents/{task_id}/stream`) 實時查看 Agent 執行日誌
- 一鍵控制暫停、恢復與停止任務
- 使用 CDP WebSocket 實時串流瀏覽器畫面（[詳細說明](./CDP-SCREENCAST.md)）

## 🔧 開發環境

### 1. 安裝依賴

```bash
npm install
```

### 2. 啟動開發伺服器

```bash
npm run dev
```

預設會在 <http://localhost:5173> 啟動，並將所有對 `/api` 的請求代理到 `http://localhost:8000`（可透過 `VITE_PROXY_TARGET` 覆寫）。

### 3. 環境變數

建立 `.env` 或 `.env.local`，可設定下列參數：

```bash
VITE_API_BASE_URL=/api        # 或完整 URL，例如 https://example.com
VITE_DEFAULT_PROVIDER=azure-openai
# VITE_DEFAULT_MODEL=gpt-4o   # 可選，預設不會傳送 model
VITE_CDP_URL=http://localhost:9222
```

若後端與前端同源部署，建議保留 `/api` 並透過 Vite proxy 重寫路徑。

### 4. 測試

```bash
npm test
```

測試使用 Vitest + Testing Library，預設環境為 jsdom。

## 💬 操作指令

在左側對話窗中輸入以下指令即可操作 Agent：

| 指令 | 功能 |
|------|------|
| `task <描述> [--model=... --provider=... --headless=false --enable_cdp=true --max_steps=50]` | 建立任務並自動呼叫 `/agents/create` |
| `task/stream` | 重新連線到 `/agents/{task_id}/stream`（任務建立後會自動啟動） |
| `task/pause` | 暫停目前任務 |
| `task/resume` | 繼續目前任務 |
| `task/stop` | 停止目前任務 |
| `clear` | 清除歷史訊息 |
| `help` | 查看指令說明 |

### CDP 即時畫面

任務啟動後，右側面板會自動連接到 CDP WebSocket 並開始串流瀏覽器畫面：

- ✅ **自動串流**：任務建立後自動獲取 WebSocket URL 並開始顯示
- 🎮 **手動控制**：可暫停/恢復串流以節省頻寬
- 🔗 **DevTools 連結**：提供在新視窗開啟完整 Chrome DevTools 的連結

詳細實作說明請參考 [CDP-SCREENCAST.md](./CDP-SCREENCAST.md)。

## 📁 專案結構

```
├── src
│   ├── App.tsx                # 主應用邏輯與 UI
│   ├── hooks/useAgentTask.ts  # 任務建立、SSE 串流與控制邏輯
│   ├── lib/api.ts             # 後端 API 請求封裝
│   ├── components             # Chat、控制列與 CDP Viewer 元件
│   └── types                  # 共用型別宣告
├── index.html
├── vite.config.ts
└── browser-server-api.json    # 後端 OpenAPI 規格 (參考)
```

## 🚀 部署提示

1. 以 `npm run build` 建置，產生 `dist` 靜態檔案。
2. 伺服器請確保能將 `/api` 代理到瀏覽器後端，或設定 `VITE_API_BASE_URL` 指向正確的 API 位址。
3. 若需要跨網段存取 CDP，請在後端啟用 `enable_cdp` 並允許前端所在主機訪問對應的 `cdp_port`。

祝使用愉快！
