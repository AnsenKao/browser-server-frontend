import { useEffect, useState } from "react";
import { getCdpInfo } from "@/lib/api";
import { useCDPScreencast } from "@/hooks/useCDPScreencast";
import type { CDPInfo } from "@/types/cdp";
import styles from "./CdpViewer.module.css";

interface CdpViewerProps {
  inspectUrl?: string | null;
  fallbackUrl?: string;
  isEnabled: boolean;
  taskId?: string | null;
}

export function CdpViewer({ inspectUrl, fallbackUrl, isEnabled, taskId }: CdpViewerProps) {
  const [cdpInfo, setCdpInfo] = useState<CDPInfo | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [cdpError, setCdpError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Fetch CDP WebSocket URL with retry logic
  useEffect(() => {
    if (!isEnabled || !taskId) return;

    const MAX_RETRIES = 10; // 最多重試 10 次
    const RETRY_DELAY = 1000; // 每次重試間隔 1 秒

    const fetchCdpInfo = () => {
      getCdpInfo()
        .then((info) => {
          const typedInfo = info as unknown as CDPInfo;
          
          // 檢查是否有錯誤訊息且 CDP 未啟用
          if ('error' in info && !typedInfo.cdp_enabled) {
            setCdpError(info.error as string);
            
            // 如果還沒超過重試次數，繼續重試
            if (retryCount < MAX_RETRIES) {
              setTimeout(() => {
                setRetryCount((prev) => prev + 1);
              }, RETRY_DELAY);
            }
            return;
          }
          
          // CDP 已啟用，成功獲取資訊
          setCdpInfo(typedInfo);
          setCdpError(null);
          setRetryCount(0); // 重置重試計數
          
          // Extract WebSocket URL from browser_info or pages
          // 優先使用 page-level WebSocket，因為 Page.startScreencast 只能在 page 上使用
          const pageWs = typedInfo.pages?.[0]?.websocket_url;
          const browserWs = typedInfo.browser_info?.webSocketDebuggerUrl;
          
          console.log("[CDP Info] Available WebSocket URLs:", { pageWs, browserWs });
          
          setWsUrl(pageWs || browserWs || null);
        })
        .catch((err) => {
          console.error("Failed to fetch CDP info:", err);
          setCdpError("無法連接到 CDP 服務");
          
          // 網路錯誤時也重試
          if (retryCount < MAX_RETRIES) {
            setTimeout(() => {
              setRetryCount((prev) => prev + 1);
            }, RETRY_DELAY);
          }
        });
    };

    // 初次延遲 500ms，讓後端有時間啟動
    const initialTimer = setTimeout(fetchCdpInfo, 500);

    return () => clearTimeout(initialTimer);
  }, [isEnabled, taskId, retryCount]);

  const screencast = useCDPScreencast({
    wsUrl,
    enabled: isEnabled && Boolean(wsUrl)
  });

  // Start/stop screencast based on WebSocket availability
  useEffect(() => {
    if (wsUrl && isEnabled && !screencast.isStreaming) {
      screencast.startScreencast();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsUrl, isEnabled]);

  if (!isEnabled) {
    return (
      <div className={styles.placeholder}>
        <h3>CDP 預覽</h3>
        <p>啟用 CDP 的任務建立後，這裡會顯示即時畫面。</p>
        <p>請在指令中加入 <code>enable_cdp=true</code> 或使用預設設定。</p>
      </div>
    );
  }

  if (!taskId) {
    return (
      <div className={styles.placeholder}>
        <h3>等待任務…</h3>
        <p>建立任務後，這裡會顯示瀏覽器即時畫面。</p>
      </div>
    );
  }

  if (cdpError) {
    return (
      <div className={styles.placeholder}>
        <h3>⏳ CDP 服務啟動中…</h3>
        <p>{cdpError}</p>
        <p style={{ fontSize: "0.9rem", color: "rgba(148, 163, 184, 0.7)", marginTop: "1rem" }}>
          任務建立後，CDP 服務需要幾秒鐘時間初始化。<br />
          畫面將會自動連接，請稍候… ({retryCount}/10)
        </p>
        {retryCount >= 10 && (
          <p style={{ fontSize: "0.9rem", color: "rgba(239, 68, 68, 0.9)", marginTop: "1rem" }}>
            ⚠️ CDP 服務可能未啟動。請確認任務建立時有設定 <code>enable_cdp=true</code>
          </p>
        )}
      </div>
    );
  }

  if (screencast.error) {
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <h3>CDP 即時畫面</h3>
          {inspectUrl && (
            <a className={styles.link} href={inspectUrl} target="_blank" rel="noreferrer">
              在新視窗開啟 DevTools
            </a>
          )}
        </header>
        <div className={styles.placeholder}>
          <h3>⚠️ 連線錯誤</h3>
          <p>無法連接到 CDP WebSocket: {screencast.error}</p>
          {inspectUrl && (
            <p>
              <a className={styles.link} href={inspectUrl} target="_blank" rel="noreferrer">
                👉 點此在新視窗開啟 DevTools
              </a>
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!wsUrl) {
    return (
      <div className={styles.placeholder}>
        <h3>等待 CDP 資訊…</h3>
        <p>任務已建立，正在取得 WebSocket 連結。</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h3>CDP 即時畫面</h3>
        <div className={styles.controls}>
          {screencast.isStreaming ? (
            <button 
              className={styles.stopButton}
              onClick={screencast.stopScreencast}
            >
              ⏸ 停止串流
            </button>
          ) : (
            <button 
              className={styles.startButton}
              onClick={screencast.startScreencast}
            >
              ▶ 開始串流
            </button>
          )}
          {inspectUrl && (
            <a className={styles.link} href={inspectUrl} target="_blank" rel="noreferrer">
              在新視窗開啟 DevTools
            </a>
          )}
        </div>
      </header>
      <div className={styles.canvasContainer}>
        <canvas 
          ref={screencast.canvasRef}
          className={styles.canvas}
        />
        {!screencast.isStreaming && (
          <div className={styles.overlay}>
            <p>串流已暫停</p>
            <button onClick={screencast.startScreencast}>▶ 重新開始</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default CdpViewer;
