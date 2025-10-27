import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { getTaskWebSocket } from "@/lib/api";
import { useCDPScreencast } from "@/hooks/useCDPScreencast";
import styles from "./CdpViewer.module.css";
export function CdpViewer({ inspectUrl, fallbackUrl, isEnabled, taskId }) {
    const [wsUrl, setWsUrl] = useState(null);
    const [cdpError, setCdpError] = useState(null);
    const [pageInfo, setPageInfo] = useState(null);
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
        let retryTimer = null;
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
                }
                else {
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
            if (retryTimer)
                clearTimeout(retryTimer);
        };
    }, [isEnabled, taskId]);
    const screencast = useCDPScreencast({
        wsUrl,
        enabled: isEnabled && Boolean(wsUrl)
    });
    // Handle canvas user interactions
    useEffect(() => {
        const canvas = screencast.canvasRef.current;
        if (!canvas || !screencast.isStreaming)
            return;
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
        const handleMouseDown = (e) => {
            // 如果在校正模式，處理校正點擊
            if (isCalibrating) {
                const rect = canvas.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const clickY = e.clientY - rect.top;
                // 計算偏移量（用戶點擊位置 - 校正點位置）
                const offsetX = clickX - calibrationDotPosition.x;
                const offsetY = clickY - calibrationDotPosition.y;
                setCalibrationOffset({ x: offsetX, y: offsetY });
                setIsCalibrating(false);
                setShowCalibrationDot(false);
                // 提供更有用的反饋
                const isAccurate = Math.abs(offsetX) < 10 && Math.abs(offsetY) < 10;
                console.log('[Calibration] Offset set:', {
                    offsetX,
                    offsetY,
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
        const handleMouseUp = (e) => {
            if (!isMouseDown)
                return;
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
        const handleMouseMove = (e) => {
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
        const handleWheel = (e) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left + calibrationOffset.x;
            const y = e.clientY - rect.top + calibrationOffset.y;
            screencast.sendScrollEvent(e.deltaX, e.deltaY, x, y);
        };
        const handleKeyDown = (e) => {
            // Handle special keys and send them to browser
            const specialKeys = ['Enter', 'Backspace', 'Delete', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
            if (specialKeys.includes(e.key)) {
                console.log('[Canvas] Special key down:', e.key, 'keyCode:', e.keyCode);
                screencast.sendKeyEvent('keyDown', e.key, e.code);
                e.preventDefault();
                e.stopPropagation();
            }
        };
        const handleKeyUp = (e) => {
            const specialKeys = ['Enter', 'Backspace', 'Delete', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
            if (specialKeys.includes(e.key)) {
                console.log('[Canvas] Special key up:', e.key, 'keyCode:', e.keyCode);
                screencast.sendKeyEvent('keyUp', e.key, e.code);
                e.preventDefault();
                e.stopPropagation();
            }
        };
        // Handle text input from the overlay input
        const handleTextInput = (e) => {
            const target = e.target;
            const value = target.value;
            if (value && textInputMode) {
                console.log('[Canvas] Text input:', value);
                screencast.sendTextInput(value);
                target.value = ''; // Clear after sending
            }
        };
        // Handle backspace separately in text input
        const handleTextKeyDown = (e) => {
            if (e.key === 'Backspace' && textInputMode) {
                console.log('[Canvas] Backspace in text input');
                screencast.sendKeyEvent('keyDown', 'Backspace', 'Backspace');
                e.preventDefault();
            }
        };
        const handleTextKeyUp = (e) => {
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
        const handlePaste = (e) => {
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
        if (!screencast.isStreaming)
            return;
        const canvas = screencast.canvasRef.current;
        if (!canvas)
            return;
        // 獲取 canvas 的實際渲染尺寸
        const rect = canvas.getBoundingClientRect();
        // 讓用戶選擇校正點的位置，而不是強制在中央
        // 這樣更靈活，用戶可以選擇一個明顯的參考點
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        setCalibrationDotPosition({ x: centerX, y: centerY });
        setIsCalibrating(true);
        setShowCalibrationDot(true);
        console.log('[Calibration] Started:', {
            centerX,
            centerY,
            tip: '如果座標準確，偏移量應該很小'
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
        return (_jsxs("div", { className: styles.placeholder, children: [_jsx("h3", { children: "CDP \u9810\u89BD" }), _jsx("p", { children: "\u555F\u7528 CDP \u7684\u4EFB\u52D9\u5EFA\u7ACB\u5F8C\uFF0C\u9019\u88E1\u6703\u986F\u793A\u5373\u6642\u756B\u9762\u3002" }), _jsxs("p", { children: ["\u8ACB\u5728\u6307\u4EE4\u4E2D\u52A0\u5165 ", _jsx("code", { children: "enable_cdp=true" }), " \u6216\u4F7F\u7528\u9810\u8A2D\u8A2D\u5B9A\u3002"] })] }));
    }
    if (!taskId) {
        return (_jsxs("div", { className: styles.placeholder, children: [_jsx("h3", { children: "\u7B49\u5F85\u4EFB\u52D9\u2026" }), _jsx("p", { children: "\u5EFA\u7ACB\u4EFB\u52D9\u5F8C\uFF0C\u9019\u88E1\u6703\u986F\u793A\u700F\u89BD\u5668\u5373\u6642\u756B\u9762\u3002" })] }));
    }
    if (cdpError) {
        return (_jsxs("div", { className: styles.placeholder, children: [_jsx("h3", { children: "\u23F3 CDP \u670D\u52D9\u555F\u52D5\u4E2D\u2026" }), _jsx("p", { children: cdpError }), _jsxs("p", { style: { fontSize: "0.9rem", color: "rgba(148, 163, 184, 0.7)", marginTop: "1rem" }, children: ["\u4EFB\u52D9\u5EFA\u7ACB\u5F8C\uFF0CCDP \u670D\u52D9\u9700\u8981\u5E7E\u79D2\u9418\u6642\u9593\u521D\u59CB\u5316\u3002", _jsx("br", {}), "\u756B\u9762\u5C07\u6703\u81EA\u52D5\u9023\u63A5\uFF0C\u8ACB\u7A0D\u5019\u2026"] }), _jsxs("p", { style: { fontSize: "0.9rem", color: "rgba(239, 68, 68, 0.9)", marginTop: "1rem" }, children: ["\u26A0\uFE0F \u5982\u679C\u6301\u7E8C\u7121\u6CD5\u9023\u63A5\uFF0C\u8ACB\u78BA\u8A8D\u4EFB\u52D9\u5EFA\u7ACB\u6642\u6709\u8A2D\u5B9A ", _jsx("code", { children: "enable_cdp=true" })] })] }));
    }
    if (screencast.error) {
        return (_jsxs("div", { className: styles.container, children: [_jsxs("header", { className: styles.header, children: [_jsx("h3", { children: "CDP \u5373\u6642\u756B\u9762" }), inspectUrl && (_jsx("a", { className: styles.link, href: inspectUrl, target: "_blank", rel: "noreferrer", children: "\u5728\u65B0\u8996\u7A97\u958B\u555F DevTools" }))] }), _jsxs("div", { className: styles.placeholder, children: [_jsx("h3", { children: "\u26A0\uFE0F \u9023\u7DDA\u932F\u8AA4" }), _jsxs("p", { children: ["\u7121\u6CD5\u9023\u63A5\u5230 CDP WebSocket: ", screencast.error] }), inspectUrl && (_jsx("p", { children: _jsx("a", { className: styles.link, href: inspectUrl, target: "_blank", rel: "noreferrer", children: "\uD83D\uDC49 \u9EDE\u6B64\u5728\u65B0\u8996\u7A97\u958B\u555F DevTools" }) }))] })] }));
    }
    if (!wsUrl) {
        return (_jsxs("div", { className: styles.placeholder, children: [_jsx("h3", { children: "\u7B49\u5F85 CDP \u8CC7\u8A0A\u2026" }), _jsx("p", { children: "\u4EFB\u52D9\u5DF2\u5EFA\u7ACB\uFF0C\u6B63\u5728\u53D6\u5F97 WebSocket \u9023\u7D50\u3002" })] }));
    }
    return (_jsxs("div", { className: styles.container, children: [_jsxs("header", { className: styles.header, children: [_jsx("h3", { children: "CDP \u5373\u6642\u756B\u9762" }), _jsxs("div", { className: styles.controls, children: [screencast.isStreaming ? (_jsx("button", { className: styles.stopButton, onClick: screencast.stopScreencast, children: "\u23F8 \u505C\u6B62\u4E32\u6D41" })) : (_jsx("button", { className: styles.startButton, onClick: screencast.startScreencast, children: "\u25B6 \u958B\u59CB\u4E32\u6D41" })), screencast.isStreaming && (_jsxs(_Fragment, { children: [_jsx("span", { style: {
                                            fontSize: '0.8rem',
                                            color: 'rgba(34, 197, 94, 0.9)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.3rem'
                                        }, children: "\uD83D\uDDB1\uFE0F \u53EF\u4E92\u52D5" }), _jsx("button", { className: styles.calibrateButton, onClick: startCalibration, disabled: isCalibrating, title: isCalibrating ? "點擊畫面上的紅點來校正座標" : "校正滑鼠座標", children: isCalibrating ? "🎯 校正中..." : "🎯 校正座標" }), isCalibrating && (_jsx("button", { className: styles.cancelButton, onClick: resetCalibration, title: "\u53D6\u6D88\u6821\u6B63", children: "\u274C \u53D6\u6D88" })), (calibrationOffset.x !== 0 || calibrationOffset.y !== 0) && (_jsxs("div", { style: {
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem'
                                        }, children: [_jsxs("span", { style: {
                                                    fontSize: '0.7rem',
                                                    color: Math.abs(calibrationOffset.x) < 10 && Math.abs(calibrationOffset.y) < 10
                                                        ? 'rgba(34, 197, 94, 0.7)'
                                                        : 'rgba(255, 165, 0, 0.7)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.2rem'
                                                }, children: [Math.abs(calibrationOffset.x) < 10 && Math.abs(calibrationOffset.y) < 10
                                                        ? '✓ 座標精確'
                                                        : '⚠ 已校正', " (", calibrationOffset.x > 0 ? '+' : '', calibrationOffset.x.toFixed(0), ", ", calibrationOffset.y > 0 ? '+' : '', calibrationOffset.y.toFixed(0), ")"] }), _jsx("button", { className: styles.resetButton, onClick: resetCalibration, title: "\u91CD\u7F6E\u6821\u6B63\uFF0C\u6062\u5FA9\u539F\u59CB\u5EA7\u6A19", children: "\uD83D\uDD04 \u91CD\u7F6E" })] }))] })), inspectUrl && (_jsx("a", { className: styles.link, href: inspectUrl, target: "_blank", rel: "noreferrer", children: "\u5728\u65B0\u8996\u7A97\u958B\u555F DevTools" }))] })] }), _jsxs("div", { className: styles.canvasContainer, children: [_jsx("canvas", { ref: screencast.canvasRef, className: styles.canvas, style: { cursor: isCalibrating ? 'crosshair' : 'pointer', outline: 'none' }, title: isCalibrating ? "點擊紅點來校正座標" : "點擊、拖拽或滾動以與瀏覽器互動" }), !screencast.isStreaming && (_jsxs("div", { className: styles.overlay, children: [_jsx("p", { children: "\u4E32\u6D41\u5DF2\u66AB\u505C" }), _jsx("button", { onClick: screencast.startScreencast, children: "\u25B6 \u91CD\u65B0\u958B\u59CB" })] })), showCalibrationDot && isCalibrating && (_jsxs("div", { className: styles.calibrationDot, style: {
                            left: `${calibrationDotPosition.x}px`,
                            top: `${calibrationDotPosition.y}px`
                        }, children: [_jsx("div", { className: styles.calibrationDotCenter }), _jsxs("div", { className: styles.calibrationInstruction, children: ["\u6821\u6B63\u5EA7\u6A19\u53C3\u8003\u9EDE", _jsx("br", {}), _jsx("small", { style: { opacity: 0.8 }, children: "\u5C07\u85CD\u8272\u6E38\u6A19\u5C0D\u6E96\u7D05\u9EDE\u4E2D\u592E\u5F8C\u9EDE\u64CA" })] })] })), showMouseCursor && isCalibrating && (_jsxs("div", { className: styles.mouseCursor, style: {
                            left: `${mousePosition.x}px`,
                            top: `${mousePosition.y}px`
                        }, children: [_jsx("div", { className: styles.mouseCursorDot }), _jsxs("div", { className: styles.distanceIndicator, children: ["\u8DDD\u96E2: ", Math.round(Math.sqrt(Math.pow(mousePosition.x - calibrationDotPosition.x, 2) +
                                        Math.pow(mousePosition.y - calibrationDotPosition.y, 2))), "px"] })] })), screencast.isStreaming && !isCalibrating && (_jsx("div", { style: {
                            position: 'absolute',
                            bottom: '0.5rem',
                            right: '0.5rem',
                            background: 'rgba(15, 23, 42, 0.8)',
                            color: 'rgba(148, 163, 184, 0.8)',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.25rem',
                            fontSize: '0.7rem',
                            pointerEvents: 'none'
                        }, children: "\uD83D\uDDB1\uFE0F \u9EDE\u64CA\u5F8C\u6253\u5B57 | \u2328\uFE0F \u7279\u6B8A\u9375 | \uD83D\uDD04 \u6EFE\u8F2A\u6372\u52D5" }))] })] }));
}
export default CdpViewer;
