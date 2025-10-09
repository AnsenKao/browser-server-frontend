import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { getCdpInfo } from "@/lib/api";
import { useCDPScreencast } from "@/hooks/useCDPScreencast";
import styles from "./CdpViewer.module.css";
export function CdpViewer({ inspectUrl, fallbackUrl, isEnabled, taskId }) {
    const [cdpInfo, setCdpInfo] = useState(null);
    const [wsUrl, setWsUrl] = useState(null);
    const [cdpError, setCdpError] = useState(null);
    const [retryCount, setRetryCount] = useState(0);
    // Fetch CDP WebSocket URL with retry logic
    useEffect(() => {
        if (!isEnabled || !taskId)
            return;
        const MAX_RETRIES = 10; // 最多重試 10 次
        const RETRY_DELAY = 1000; // 每次重試間隔 1 秒
        const fetchCdpInfo = () => {
            getCdpInfo()
                .then((info) => {
                const typedInfo = info;
                // 檢查是否有錯誤訊息且 CDP 未啟用
                if ('error' in info && !typedInfo.cdp_enabled) {
                    setCdpError(info.error);
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
        return (_jsxs("div", { className: styles.placeholder, children: [_jsx("h3", { children: "CDP \u9810\u89BD" }), _jsx("p", { children: "\u555F\u7528 CDP \u7684\u4EFB\u52D9\u5EFA\u7ACB\u5F8C\uFF0C\u9019\u88E1\u6703\u986F\u793A\u5373\u6642\u756B\u9762\u3002" }), _jsxs("p", { children: ["\u8ACB\u5728\u6307\u4EE4\u4E2D\u52A0\u5165 ", _jsx("code", { children: "enable_cdp=true" }), " \u6216\u4F7F\u7528\u9810\u8A2D\u8A2D\u5B9A\u3002"] })] }));
    }
    if (!taskId) {
        return (_jsxs("div", { className: styles.placeholder, children: [_jsx("h3", { children: "\u7B49\u5F85\u4EFB\u52D9\u2026" }), _jsx("p", { children: "\u5EFA\u7ACB\u4EFB\u52D9\u5F8C\uFF0C\u9019\u88E1\u6703\u986F\u793A\u700F\u89BD\u5668\u5373\u6642\u756B\u9762\u3002" })] }));
    }
    if (cdpError) {
        return (_jsxs("div", { className: styles.placeholder, children: [_jsx("h3", { children: "\u23F3 CDP \u670D\u52D9\u555F\u52D5\u4E2D\u2026" }), _jsx("p", { children: cdpError }), _jsxs("p", { style: { fontSize: "0.9rem", color: "rgba(148, 163, 184, 0.7)", marginTop: "1rem" }, children: ["\u4EFB\u52D9\u5EFA\u7ACB\u5F8C\uFF0CCDP \u670D\u52D9\u9700\u8981\u5E7E\u79D2\u9418\u6642\u9593\u521D\u59CB\u5316\u3002", _jsx("br", {}), "\u756B\u9762\u5C07\u6703\u81EA\u52D5\u9023\u63A5\uFF0C\u8ACB\u7A0D\u5019\u2026 (", retryCount, "/10)"] }), retryCount >= 10 && (_jsxs("p", { style: { fontSize: "0.9rem", color: "rgba(239, 68, 68, 0.9)", marginTop: "1rem" }, children: ["\u26A0\uFE0F CDP \u670D\u52D9\u53EF\u80FD\u672A\u555F\u52D5\u3002\u8ACB\u78BA\u8A8D\u4EFB\u52D9\u5EFA\u7ACB\u6642\u6709\u8A2D\u5B9A ", _jsx("code", { children: "enable_cdp=true" })] }))] }));
    }
    if (screencast.error) {
        return (_jsxs("div", { className: styles.container, children: [_jsxs("header", { className: styles.header, children: [_jsx("h3", { children: "CDP \u5373\u6642\u756B\u9762" }), inspectUrl && (_jsx("a", { className: styles.link, href: inspectUrl, target: "_blank", rel: "noreferrer", children: "\u5728\u65B0\u8996\u7A97\u958B\u555F DevTools" }))] }), _jsxs("div", { className: styles.placeholder, children: [_jsx("h3", { children: "\u26A0\uFE0F \u9023\u7DDA\u932F\u8AA4" }), _jsxs("p", { children: ["\u7121\u6CD5\u9023\u63A5\u5230 CDP WebSocket: ", screencast.error] }), inspectUrl && (_jsx("p", { children: _jsx("a", { className: styles.link, href: inspectUrl, target: "_blank", rel: "noreferrer", children: "\uD83D\uDC49 \u9EDE\u6B64\u5728\u65B0\u8996\u7A97\u958B\u555F DevTools" }) }))] })] }));
    }
    if (!wsUrl) {
        return (_jsxs("div", { className: styles.placeholder, children: [_jsx("h3", { children: "\u7B49\u5F85 CDP \u8CC7\u8A0A\u2026" }), _jsx("p", { children: "\u4EFB\u52D9\u5DF2\u5EFA\u7ACB\uFF0C\u6B63\u5728\u53D6\u5F97 WebSocket \u9023\u7D50\u3002" })] }));
    }
    return (_jsxs("div", { className: styles.container, children: [_jsxs("header", { className: styles.header, children: [_jsx("h3", { children: "CDP \u5373\u6642\u756B\u9762" }), _jsxs("div", { className: styles.controls, children: [screencast.isStreaming ? (_jsx("button", { className: styles.stopButton, onClick: screencast.stopScreencast, children: "\u23F8 \u505C\u6B62\u4E32\u6D41" })) : (_jsx("button", { className: styles.startButton, onClick: screencast.startScreencast, children: "\u25B6 \u958B\u59CB\u4E32\u6D41" })), inspectUrl && (_jsx("a", { className: styles.link, href: inspectUrl, target: "_blank", rel: "noreferrer", children: "\u5728\u65B0\u8996\u7A97\u958B\u555F DevTools" }))] })] }), _jsxs("div", { className: styles.canvasContainer, children: [_jsx("canvas", { ref: screencast.canvasRef, className: styles.canvas }), !screencast.isStreaming && (_jsxs("div", { className: styles.overlay, children: [_jsx("p", { children: "\u4E32\u6D41\u5DF2\u66AB\u505C" }), _jsx("button", { onClick: screencast.startScreencast, children: "\u25B6 \u91CD\u65B0\u958B\u59CB" })] }))] })] }));
}
export default CdpViewer;
