import { useEffect, useState } from "react";
import { getTaskWebSocket } from "@/lib/api";
import { useCDPScreencast } from "@/hooks/useCDPScreencast";
import styles from "./CdpViewer.module.css";

interface CdpViewerProps {
  inspectUrl?: string | null;
  fallbackUrl?: string;
  isEnabled: boolean;
  taskId?: string | null;
}

export function CdpViewer({ inspectUrl, fallbackUrl, isEnabled, taskId }: CdpViewerProps) {
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [cdpError, setCdpError] = useState<string | null>(null);
  const [pageInfo, setPageInfo] = useState<{
    pageId?: string;
    pageUrl?: string;
    pageTitle?: string;
  } | null>(null);
  
  // 座標校正相關狀態
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationOffset, setCalibrationOffset] = useState({ x: 0, y: 0 });
  const [showCalibrationDot, setShowCalibrationDot] = useState(false);
  const [calibrationDotPosition, setCalibrationDotPosition] = useState({ x: 0, y: 0 });
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [showMouseCursor, setShowMouseCursor] = useState(false);

  // Fetch CDP WebSocket URL with retry logic
  useEffect(() => {
    if (!isEnabled || !taskId) {
      // 清除狀態當沒有任務時
      setWsUrl(null);
      setCdpError(null);
      setPageInfo(null);
      return;
    }

    // 當 taskId 改變時，清除舊的連接信息並重置重試計數
    setWsUrl(null);
    setCdpError(null);
    setPageInfo(null);
    
    let currentRetry = 0;
    const MAX_RETRIES = 10; // 最多重試 10 次
    const RETRY_DELAY = 1000; // 每次重試間隔 1 秒
    let retryTimer: number | null = null;

    const fetchTaskWebSocket = () => {
      console.log(`[CDP Viewer] Fetching WebSocket for task: ${taskId} (attempt ${currentRetry + 1}/${MAX_RETRIES + 1})`);
      getTaskWebSocket(taskId)
        .then((response) => {
          // 檢查是否有錯誤或 CDP 未啟用
          if (response.error || !response.cdp_enabled) {
            setCdpError(response.error || "CDP 未啟用");
            
            // 如果還沒超過重試次數，繼續重試
            if (currentRetry < MAX_RETRIES) {
              currentRetry++;
              retryTimer = window.setTimeout(fetchTaskWebSocket, RETRY_DELAY);
            }
            return;
          }
          
          // 成功獲取 WebSocket URL
          if (response.websocket_url) {
            setWsUrl(response.websocket_url);
            setPageInfo({
              pageId: response.page_id || undefined,
              pageUrl: response.page_url || undefined,
              pageTitle: response.page_title || undefined
            });
            setCdpError(null);
            
            console.log("[CDP Task WebSocket] Successfully fetched:", {
              taskId,
              websocketUrl: response.websocket_url,
              pageId: response.page_id,
              pageUrl: response.page_url,
              pageTitle: response.page_title
            });
          } else {
            setCdpError("無法獲取 WebSocket URL");
            
            // 重試
            if (currentRetry < MAX_RETRIES) {
              currentRetry++;
              retryTimer = window.setTimeout(fetchTaskWebSocket, RETRY_DELAY);
            }
          }
        })
        .catch((err) => {
          console.error("Failed to fetch task WebSocket:", err);
          setCdpError(err instanceof Error ? err.message : "無法連接到 CDP 服務");
          
          // 網路錯誤時也重試
          if (currentRetry < MAX_RETRIES) {
            currentRetry++;
            retryTimer = window.setTimeout(fetchTaskWebSocket, RETRY_DELAY);
          }
        });
    };

    // 初次延遲 500ms，讓後端有時間啟動
    const initialTimer = window.setTimeout(fetchTaskWebSocket, 500);

    return () => {
      clearTimeout(initialTimer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [isEnabled, taskId]);

  const screencast = useCDPScreencast({
    wsUrl,
    enabled: isEnabled && Boolean(wsUrl)
  });

  // Handle canvas user interactions
  useEffect(() => {
    const canvas = screencast.canvasRef.current;
    if (!canvas || !screencast.isStreaming) return;

    let isMouseDown = false;
    let textInputMode = false;

    // Create a text input overlay
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.style.position = 'absolute';
    textInput.style.background = 'transparent';
    textInput.style.border = 'none';
    textInput.style.outline = 'none';
    textInput.style.color = 'transparent';
    textInput.style.fontSize = '16px'; // Prevent zoom on iOS
    textInput.style.pointerEvents = 'none';
    textInput.style.zIndex = '1000';
    textInput.style.opacity = '0';
    
    const canvasContainer = canvas.parentElement;
    if (canvasContainer) {
      canvasContainer.style.position = 'relative';
      canvasContainer.appendChild(textInput);
    }

    const handleMouseDown = (e: MouseEvent) => {
      // 如果在校正模式，處理校正點擊
      if (isCalibrating) {
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        
        // 計算偏移量（校正點位置 - 用戶點擊位置）
        // 這樣在應用時用加法：實際座標 = 點擊座標 + 偏移量
        const offsetX = calibrationDotPosition.x - clickX;
        const offsetY = calibrationDotPosition.y - clickY;
        
        setCalibrationOffset({ x: offsetX, y: offsetY });
        setIsCalibrating(false);
        setShowCalibrationDot(false);
        
        // 提供更有用的反饋
        const isAccurate = Math.abs(offsetX) < 10 && Math.abs(offsetY) < 10;
        console.log('[Calibration] Offset set:', { 
          offsetX, 
          offsetY, 
          clickPosition: { x: clickX, y: clickY },
          targetPosition: calibrationDotPosition,
          isAccurate: isAccurate ? '座標很準確！' : '已校正偏移',
          tip: isAccurate ? '偏移量很小，座標應該是準確的' : '偏移量較大，已應用校正'
        });
        return;
      }
      
      isMouseDown = true;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left + calibrationOffset.x;
      const y = e.clientY - rect.top + calibrationOffset.y;
      
      const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle';
      screencast.sendMouseEvent('mousePressed', x, y, button);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isMouseDown) return;
      isMouseDown = false;
      
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left + calibrationOffset.x;
      const y = e.clientY - rect.top + calibrationOffset.y;
      
      const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle';
      screencast.sendMouseEvent('mouseReleased', x, y, button);
      
      // Enable text input mode after click
      textInputMode = true;
      textInput.style.pointerEvents = 'auto';
      textInput.style.left = `${x}px`;
      textInput.style.top = `${y}px`;
      textInput.focus();
      console.log('[Canvas] Text input mode enabled at:', { x, y });
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;
      
      // 如果在校正模式，更新滑鼠位置顯示
      if (isCalibrating) {
        setMousePosition({ x: rawX, y: rawY });
        setShowMouseCursor(true);
        return; // 校正模式下不發送滑鼠移動事件
      }
      
      const x = rawX + calibrationOffset.x;
      const y = rawY + calibrationOffset.y;
      
      screencast.sendMouseEvent('mouseMoved', x, y);
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left + calibrationOffset.x;
      const y = e.clientY - rect.top + calibrationOffset.y;
      
      screencast.sendScrollEvent(e.deltaX, e.deltaY, x, y);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle special keys and send them to browser
      const specialKeys = ['Enter', 'Backspace', 'Delete', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
      
      if (specialKeys.includes(e.key)) {
        console.log('[Canvas] Special key down:', e.key, 'keyCode:', e.keyCode);
        screencast.sendKeyEvent('keyDown', e.key, e.code);
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const specialKeys = ['Enter', 'Backspace', 'Delete', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
      
      if (specialKeys.includes(e.key)) {
        console.log('[Canvas] Special key up:', e.key, 'keyCode:', e.keyCode);
        screencast.sendKeyEvent('keyUp', e.key, e.code);
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Handle text input from the overlay input
    const handleTextInput = (e: Event) => {
      const target = e.target as HTMLInputElement;
      const value = target.value;
      if (value && textInputMode) {
        console.log('[Canvas] Text input:', value);
        screencast.sendTextInput(value);
        target.value = ''; // Clear after sending
      }
    };

    // Handle backspace separately in text input
    const handleTextKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Backspace' && textInputMode) {
        console.log('[Canvas] Backspace in text input');
        screencast.sendKeyEvent('keyDown', 'Backspace', 'Backspace');
        e.preventDefault();
      }
    };

    const handleTextKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Backspace' && textInputMode) {
        console.log('[Canvas] Backspace up in text input');
        screencast.sendKeyEvent('keyUp', 'Backspace', 'Backspace');
        e.preventDefault();
      }
    };

    const handleTextBlur = () => {
      console.log('[Canvas] Text input mode disabled');
      textInputMode = false;
      textInput.style.pointerEvents = 'none';
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData?.getData('text');
      if (text && textInputMode) {
        console.log('[Canvas] Paste:', text);
        screencast.sendTextInput(text);
      }
    };

    const handleMouseLeave = () => {
      if (isCalibrating) {
        setShowMouseCursor(false);
      }
    };
    
    const handleMouseEnter = () => {
      if (isCalibrating) {
        setShowMouseCursor(true);
      }
    };
    
    // Add event listeners
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('mouseenter', handleMouseEnter);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    
    // Add keyboard event listeners to canvas
    canvas.tabIndex = 0;
    canvas.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('keyup', handleKeyUp);
    
    // Add text input listeners
    textInput.addEventListener('input', handleTextInput);
    textInput.addEventListener('keydown', handleTextKeyDown);
    textInput.addEventListener('keyup', handleTextKeyUp);
    textInput.addEventListener('blur', handleTextBlur);
    textInput.addEventListener('paste', handlePaste);
    
    // Prevent context menu
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('mouseenter', handleMouseEnter);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('keydown', handleKeyDown);
      canvas.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('contextmenu', (e) => e.preventDefault());
      
      // Clean up text input
      textInput.removeEventListener('input', handleTextInput);
      textInput.removeEventListener('keydown', handleTextKeyDown);
      textInput.removeEventListener('keyup', handleTextKeyUp);
      textInput.removeEventListener('blur', handleTextBlur);
      textInput.removeEventListener('paste', handlePaste);
      if (canvasContainer && canvasContainer.contains(textInput)) {
        canvasContainer.removeChild(textInput);
      }
    };
  }, [screencast.isStreaming, screencast.sendMouseEvent, screencast.sendKeyEvent, screencast.sendScrollEvent, screencast.sendTextInput, isCalibrating, calibrationOffset, calibrationDotPosition]);

  // 開始座標校正
  const startCalibration = () => {
    if (!screencast.isStreaming) return;
    
    const canvas = screencast.canvasRef.current;
    if (!canvas) return;
    
    // 獲取 canvas 的實際渲染尺寸
    const rect = canvas.getBoundingClientRect();
    
    // 使用左上角作為校正點 - 這是最可靠的參考點
    // 左上角對應座標 (0, 0)，不受瀏覽器 UI 影響
    const topLeftX = 30; // 留一點邊距，方便點擊
    const topLeftY = 30;
    
    setCalibrationDotPosition({ x: topLeftX, y: topLeftY });
    setIsCalibrating(true);
    setShowCalibrationDot(true);
    
    console.log('[Calibration] Started:', { 
      topLeftX, 
      topLeftY,
      tip: '左上角是最可靠的校正參考點'
    });
  };
  
  // 重置座標校正
  const resetCalibration = () => {
    setCalibrationOffset({ x: 0, y: 0 });
    setIsCalibrating(false);
    setShowCalibrationDot(false);
    setShowMouseCursor(false);
    console.log('[Calibration] Reset');
  };

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
          畫面將會自動連接，請稍候…
        </p>
        <p style={{ fontSize: "0.9rem", color: "rgba(239, 68, 68, 0.9)", marginTop: "1rem" }}>
          ⚠️ 如果持續無法連接，請確認任務建立時有設定 <code>enable_cdp=true</code>
        </p>
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
          {screencast.isStreaming && (
            <>
              <span style={{ 
                fontSize: '0.8rem', 
                color: 'rgba(34, 197, 94, 0.9)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}>
                🖱️ 可互動
              </span>
              <button 
                className={styles.calibrateButton}
                onClick={startCalibration}
                disabled={isCalibrating}
                title={isCalibrating ? "點擊畫面上的紅點來校正座標" : "校正滑鼠座標"}
              >
                {isCalibrating ? "🎯 校正中..." : "🎯 校正座標"}
              </button>
              {isCalibrating && (
                <button 
                  className={styles.cancelButton}
                  onClick={resetCalibration}
                  title="取消校正"
                >
                  ❌ 取消
                </button>
              )}
              {(calibrationOffset.x !== 0 || calibrationOffset.y !== 0) && (
                <div style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span style={{ 
                    fontSize: '0.7rem', 
                    color: Math.abs(calibrationOffset.x) < 10 && Math.abs(calibrationOffset.y) < 10 
                      ? 'rgba(34, 197, 94, 0.7)' 
                      : 'rgba(255, 165, 0, 0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.2rem'
                  }}>
                    {Math.abs(calibrationOffset.x) < 10 && Math.abs(calibrationOffset.y) < 10 
                      ? '✓ 座標精確' 
                      : '⚠ 已校正'
                    } ({calibrationOffset.x > 0 ? '+' : ''}{calibrationOffset.x.toFixed(0)}, {calibrationOffset.y > 0 ? '+' : ''}{calibrationOffset.y.toFixed(0)})
                  </span>
                  <button 
                    className={styles.resetButton}
                    onClick={resetCalibration}
                    title="重置校正，恢復原始座標"
                  >
                    🔄 重置
                  </button>
                </div>
              )}
            </>
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
          style={{ cursor: isCalibrating ? 'crosshair' : 'pointer', outline: 'none' }}
          title={isCalibrating ? "點擊紅點來校正座標" : "點擊、拖拽或滾動以與瀏覽器互動"}
        />
        {!screencast.isStreaming && (
          <div className={styles.overlay}>
            <p>串流已暫停</p>
            <button onClick={screencast.startScreencast}>▶ 重新開始</button>
          </div>
        )}
        {showCalibrationDot && isCalibrating && (
          <div 
            className={styles.calibrationDot}
            style={{
              left: `${calibrationDotPosition.x}px`,
              top: `${calibrationDotPosition.y}px`
            }}
          >
            <div className={styles.calibrationDotCenter}></div>
            <div className={styles.calibrationInstruction}>
              校正座標參考點（左上角）
              <br />
              <small style={{ opacity: 0.8 }}>
                將藍色游標對準紅點中央後點擊
              </small>
            </div>
          </div>
        )}
        {showMouseCursor && isCalibrating && (
          <div 
            className={styles.mouseCursor}
            style={{
              left: `${mousePosition.x}px`,
              top: `${mousePosition.y}px`
            }}
          >
            <div className={styles.mouseCursorDot}></div>
            <div className={styles.distanceIndicator}>
              距離: {Math.round(Math.sqrt(
                Math.pow(mousePosition.x - calibrationDotPosition.x, 2) + 
                Math.pow(mousePosition.y - calibrationDotPosition.y, 2)
              ))}px
            </div>
          </div>
        )}
        {screencast.isStreaming && !isCalibrating && (
          <div style={{
            position: 'absolute',
            bottom: '0.5rem',
            right: '0.5rem',
            background: 'rgba(15, 23, 42, 0.8)',
            color: 'rgba(148, 163, 184, 0.8)',
            padding: '0.25rem 0.5rem',
            borderRadius: '0.25rem',
            fontSize: '0.7rem',
            pointerEvents: 'none'
          }}>
            🖱️ 點擊後打字 | ⌨️ 特殊鍵 | 🔄 滾輪捲動
          </div>
        )}
      </div>
    </div>
  );
}

export default CdpViewer;
