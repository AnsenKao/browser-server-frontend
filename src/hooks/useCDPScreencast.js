import { useCallback, useEffect, useRef, useState } from "react";
export function useCDPScreencast({ wsUrl, enabled }) {
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState(null);
    const [lastFrame, setLastFrame] = useState(null);
    const wsRef = useRef(null);
    const canvasRef = useRef(null);
    const screenshotIntervalRef = useRef(null);
    const targetIdRef = useRef(null);
    const sessionIdRef = useRef(null); // Session ID for flatten mode
    const messageIdRef = useRef(100); // Start from 100 to avoid conflicts
    const imageWidthRef = useRef(0); // Store actual image dimensions
    const imageHeightRef = useRef(0);
    const viewportMetadataRef = useRef({
        deviceWidth: 0,
        deviceHeight: 0,
        pageScaleFactor: 1,
        offsetTop: 0,
        offsetLeft: 0,
        scrollOffsetX: 0,
        scrollOffsetY: 0
    });
    const pendingLayoutMetricsRequestIdRef = useRef(null);
    const updateViewportMetadata = useCallback((metadata) => {
        const sanitized = Object.entries(metadata).reduce((acc, [key, value]) => {
            if (typeof value === 'number' && Number.isFinite(value)) {
                acc[key] = value;
            }
            return acc;
        }, {});
        viewportMetadataRef.current = {
            ...viewportMetadataRef.current,
            ...sanitized
        };
    }, []);
    const requestLayoutMetrics = useCallback(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !sessionIdRef.current) {
            return;
        }
        const requestId = ++messageIdRef.current;
        pendingLayoutMetricsRequestIdRef.current = requestId;
        wsRef.current.send(JSON.stringify({
            id: requestId,
            method: "Page.getLayoutMetrics",
            sessionId: sessionIdRef.current
        }));
    }, []);
    const convertCanvasPoint = useCallback((canvasX, canvasY, rect, calibrationOffset) => {
        const manualOffsetX = calibrationOffset?.x ?? 0;
        const manualOffsetY = calibrationOffset?.y ?? 0;
        const scaleX = rect.width > 0 && imageWidthRef.current > 0 ? imageWidthRef.current / rect.width : 1;
        const scaleY = rect.height > 0 && imageHeightRef.current > 0 ? imageHeightRef.current / rect.height : 1;
        const imageX = (canvasX + manualOffsetX) * scaleX;
        const imageY = (canvasY + manualOffsetY) * scaleY;
        const { offsetLeft, offsetTop, pageScaleFactor, deviceWidth, deviceHeight } = viewportMetadataRef.current;
        const viewportScale = pageScaleFactor || 1;
        let viewportX = (imageX - offsetLeft) / viewportScale;
        let viewportY = (imageY - offsetTop) / viewportScale;
        if (deviceWidth > 0 && Number.isFinite(deviceWidth)) {
            viewportX = Math.max(0, Math.min(deviceWidth - 1, viewportX));
        }
        if (deviceHeight > 0 && Number.isFinite(deviceHeight)) {
            viewportY = Math.max(0, Math.min(deviceHeight - 1, viewportY));
        }
        return {
            x: Math.round(viewportX),
            y: Math.round(viewportY)
        };
    }, []);
    const startScreencast = useCallback(async () => {
        if (!wsUrl || !enabled) {
            setError("WebSocket URL not available");
            return;
        }
        // 避免重複連接
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            return;
        }
        // 關閉現有連接
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        try {
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;
            ws.onopen = () => {
                setIsStreaming(true);
                setError(null);
                // Check if this is a page-level or browser-level WebSocket
                const isPageLevel = wsUrl.includes('/page/');
                if (isPageLevel) {
                    // Enable Page domain first
                    ws.send(JSON.stringify({
                        id: 0,
                        method: "Page.enable"
                    }));
                    // Enable Input domain for user interactions
                    ws.send(JSON.stringify({
                        id: 10,
                        method: "Input.enable"
                    }));
                    // Start screencast
                    ws.send(JSON.stringify({
                        id: 1,
                        method: "Page.startScreencast",
                        params: {
                            format: "jpeg",
                            quality: 80,
                            maxWidth: 1280,
                            maxHeight: 720,
                            everyNthFrame: 1
                        }
                    }));
                }
                else {
                    // Enable target discovery to get notifications about new targets
                    ws.send(JSON.stringify({
                        id: ++messageIdRef.current,
                        method: "Target.setDiscoverTargets",
                        params: {
                            discover: true
                        }
                    }));
                    // Get list of targets (pages)
                    ws.send(JSON.stringify({
                        id: ++messageIdRef.current,
                        method: "Target.getTargets"
                    }));
                }
            };
            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    // Log errors
                    if (message.error) {
                        console.error("[CDP] Error:", message.error);
                    }
                    if (pendingLayoutMetricsRequestIdRef.current !== null && message.id === pendingLayoutMetricsRequestIdRef.current) {
                        pendingLayoutMetricsRequestIdRef.current = null;
                        if (message.result) {
                            const visualViewport = message.result.visualViewport;
                            const layoutViewport = message.result.layoutViewport;
                            updateViewportMetadata({
                                deviceWidth: typeof visualViewport?.clientWidth === 'number'
                                    ? visualViewport.clientWidth
                                    : typeof layoutViewport?.clientWidth === 'number'
                                        ? layoutViewport.clientWidth
                                        : undefined,
                                deviceHeight: typeof visualViewport?.clientHeight === 'number'
                                    ? visualViewport.clientHeight
                                    : typeof layoutViewport?.clientHeight === 'number'
                                        ? layoutViewport.clientHeight
                                        : undefined,
                                pageScaleFactor: typeof visualViewport?.scale === 'number' ? visualViewport.scale : undefined,
                                scrollOffsetX: typeof visualViewport?.pageX === 'number' ? visualViewport.pageX : undefined,
                                scrollOffsetY: typeof visualViewport?.pageY === 'number' ? visualViewport.pageY : undefined,
                                offsetLeft: 0,
                                offsetTop: 0
                            });
                        }
                        return;
                    }
                    // Handle Target.getTargets response
                    if (message.result && message.result.targetInfos) {
                        const targets = message.result.targetInfos || [];
                        // Find first page target
                        const pageTarget = targets.find((t) => t.type === 'page');
                        if (pageTarget) {
                            targetIdRef.current = pageTarget.targetId;
                            // Use Target.attachToTarget with flatten: true (modern way)
                            ws.send(JSON.stringify({
                                id: ++messageIdRef.current,
                                method: "Target.attachToTarget",
                                params: {
                                    targetId: pageTarget.targetId,
                                    flatten: true
                                }
                            }));
                        }
                        else {
                            // Retry after 3 seconds if still no target
                            setTimeout(() => {
                                if (!sessionIdRef.current && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                                    wsRef.current.send(JSON.stringify({
                                        id: ++messageIdRef.current,
                                        method: "Target.getTargets"
                                    }));
                                }
                            }, 3000);
                        }
                    }
                    // Handle Target.attachToTarget response
                    if (message.result && message.result.sessionId) {
                        sessionIdRef.current = message.result.sessionId;
                        // Now enable Page domain using flatten mode (sessionId in command)
                        ws.send(JSON.stringify({
                            id: ++messageIdRef.current,
                            method: "Page.enable",
                            sessionId: sessionIdRef.current
                        }));
                        // Enable Input domain for user interactions
                        ws.send(JSON.stringify({
                            id: ++messageIdRef.current,
                            method: "Input.enable",
                            sessionId: sessionIdRef.current
                        }));
                        // Start screenshot polling using flatten mode
                        const captureScreenshot = () => {
                            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !sessionIdRef.current) {
                                return;
                            }
                            // 更新視覺視窗資訊，改善滑鼠座標精準度
                            requestLayoutMetrics();
                            ws.send(JSON.stringify({
                                id: ++messageIdRef.current,
                                method: "Page.captureScreenshot",
                                params: {
                                    format: "jpeg",
                                    quality: 80
                                },
                                sessionId: sessionIdRef.current
                            }));
                        };
                        // Capture first screenshot immediately
                        captureScreenshot();
                        // Then poll every 500ms
                        screenshotIntervalRef.current = window.setInterval(captureScreenshot, 500);
                    }
                    // Handle Target.targetCreated event
                    if (message.method === "Target.targetCreated") {
                        const targetInfo = message.params.targetInfo;
                        // If this is a page target and we don't have a session yet, attach to it
                        if (targetInfo.type === 'page' && !sessionIdRef.current) {
                            targetIdRef.current = targetInfo.targetId;
                            // Attach to the new target with flatten mode
                            ws.send(JSON.stringify({
                                id: ++messageIdRef.current,
                                method: "Target.attachToTarget",
                                params: {
                                    targetId: targetInfo.targetId,
                                    flatten: true
                                }
                            }));
                        }
                    }
                    // Handle Page.captureScreenshot response (flatten mode)
                    if (message.result && message.result.data && message.sessionId) {
                        const frame = {
                            data: message.result.data,
                            sessionId: 0,
                            metadata: {
                                timestamp: Date.now() / 1000,
                                deviceWidth: 0,
                                deviceHeight: 0,
                                pageScaleFactor: 1
                            }
                        };
                        setLastFrame(frame);
                    }
                    // Handle Page.screencastFrame (for page-level WebSocket)
                    if (message.method === "Page.screencastFrame") {
                        console.log("[CDP] Screencast frame received, sessionId:", message.params.sessionId);
                        const frame = {
                            data: message.params.data,
                            sessionId: message.params.sessionId,
                            metadata: message.params.metadata
                        };
                        if (message.params.metadata) {
                            const metadata = message.params.metadata;
                            updateViewportMetadata({
                                deviceWidth: typeof metadata.deviceWidth === 'number' ? metadata.deviceWidth : viewportMetadataRef.current.deviceWidth,
                                deviceHeight: typeof metadata.deviceHeight === 'number' ? metadata.deviceHeight : viewportMetadataRef.current.deviceHeight,
                                pageScaleFactor: typeof metadata.pageScaleFactor === 'number' ? metadata.pageScaleFactor : viewportMetadataRef.current.pageScaleFactor,
                                offsetTop: typeof metadata.offsetTop === 'number' ? metadata.offsetTop : viewportMetadataRef.current.offsetTop,
                                offsetLeft: typeof metadata.offsetLeft === 'number' ? metadata.offsetLeft : viewportMetadataRef.current.offsetLeft,
                                scrollOffsetX: typeof metadata.scrollOffsetX === 'number' ? metadata.scrollOffsetX : viewportMetadataRef.current.scrollOffsetX,
                                scrollOffsetY: typeof metadata.scrollOffsetY === 'number' ? metadata.scrollOffsetY : viewportMetadataRef.current.scrollOffsetY
                            });
                        }
                        setLastFrame(frame);
                        // Acknowledge frame
                        ws.send(JSON.stringify({
                            id: ++messageIdRef.current,
                            method: "Page.screencastFrameAck",
                            params: {
                                sessionId: message.params.sessionId
                            }
                        }));
                    }
                }
                catch (err) {
                    console.error("[CDP] Failed to parse message:", err);
                }
            };
            ws.onerror = (err) => {
                console.error("[CDP] WebSocket error:", err);
                setError("WebSocket connection error");
                setIsStreaming(false);
            };
            ws.onclose = () => {
                setIsStreaming(false);
            };
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Failed to connect");
            setIsStreaming(false);
        }
    }, [wsUrl, enabled]);
    // Send user input events to browser
    const sendMouseEvent = useCallback((type, canvasX, canvasY, options = {}) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            return;
        }
        const canvas = canvasRef.current;
        if (!canvas)
            return;
        const rect = canvas.getBoundingClientRect();
        const { calibrationOffset, button } = options;
        const { x, y } = convertCanvasPoint(canvasX, canvasY, rect, calibrationOffset);
        const eventParams = {
            type,
            x,
            y,
            button: button || 'left',
            clickCount: type === 'mousePressed' ? 1 : undefined
        };
        // Send to page or session depending on connection type
        if (wsUrl && wsUrl.includes('/page/')) {
            wsRef.current.send(JSON.stringify({
                id: ++messageIdRef.current,
                method: "Input.dispatchMouseEvent",
                params: eventParams
            }));
        }
        else if (sessionIdRef.current) {
            wsRef.current.send(JSON.stringify({
                id: ++messageIdRef.current,
                method: "Input.dispatchMouseEvent",
                params: eventParams,
                sessionId: sessionIdRef.current
            }));
        }
    }, [wsUrl]);
    // Send text input directly to browser
    const sendTextInput = useCallback((text) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.warn('[CDP] WebSocket not ready for text input');
            return;
        }
        console.log('[CDP] Sending text input:', text);
        // Send to page or session depending on connection type
        if (wsUrl && wsUrl.includes('/page/')) {
            wsRef.current.send(JSON.stringify({
                id: ++messageIdRef.current,
                method: "Input.insertText",
                params: {
                    text: text
                }
            }));
        }
        else if (sessionIdRef.current) {
            wsRef.current.send(JSON.stringify({
                id: ++messageIdRef.current,
                method: "Input.insertText",
                params: {
                    text: text
                },
                sessionId: sessionIdRef.current
            }));
        }
    }, [wsUrl]);
    const sendKeyEvent = useCallback((type, key, code, text) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.warn('[CDP] WebSocket not ready for key event');
            return;
        }
        console.log('[CDP] Sending key event:', { type, key, code, text });
        const eventParams = {
            type,
        };
        // For keyDown/keyUp events
        if (type === 'keyDown' || type === 'keyUp') {
            eventParams.key = key;
            if (code) {
                eventParams.code = code;
            }
            // Add windowsVirtualKeyCode for better compatibility (CDP requires this)
            const windowsVirtualKeyCodeMap = {
                'Backspace': 0x08,
                'Tab': 0x09,
                'Enter': 0x0D,
                'Escape': 0x1B,
                'Delete': 0x2E,
                'ArrowLeft': 0x25,
                'ArrowUp': 0x26,
                'ArrowRight': 0x27,
                'ArrowDown': 0x28,
                'Home': 0x24,
                'End': 0x23,
                'PageUp': 0x21,
                'PageDown': 0x22,
            };
            if (windowsVirtualKeyCodeMap[key]) {
                eventParams.windowsVirtualKeyCode = windowsVirtualKeyCodeMap[key];
                eventParams.nativeVirtualKeyCode = windowsVirtualKeyCodeMap[key];
            }
            else if (key.length === 1) {
                // For regular characters, use their uppercase ASCII code
                const charCode = key.toUpperCase().charCodeAt(0);
                eventParams.windowsVirtualKeyCode = charCode;
                eventParams.nativeVirtualKeyCode = charCode;
                eventParams.text = key;
                eventParams.unmodifiedText = key;
            }
        }
        // For char events (text input)
        if (type === 'char' && text) {
            eventParams.text = text;
            eventParams.unmodifiedText = text;
        }
        // Send to page or session depending on connection type
        if (wsUrl && wsUrl.includes('/page/')) {
            wsRef.current.send(JSON.stringify({
                id: ++messageIdRef.current,
                method: "Input.dispatchKeyEvent",
                params: eventParams
            }));
        }
        else if (sessionIdRef.current) {
            wsRef.current.send(JSON.stringify({
                id: ++messageIdRef.current,
                method: "Input.dispatchKeyEvent",
                params: eventParams,
                sessionId: sessionIdRef.current
            }));
        }
    }, [wsUrl]);
    const sendScrollEvent = useCallback((deltaX, deltaY, canvasX, canvasY, options = {}) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            return;
        }
        const canvas = canvasRef.current;
        if (!canvas)
            return;
        const rect = canvas.getBoundingClientRect();
        const { x, y } = convertCanvasPoint(canvasX, canvasY, rect, options.calibrationOffset);
        const viewportScale = viewportMetadataRef.current.pageScaleFactor || 1;
        const adjustedDeltaX = deltaX / viewportScale;
        const adjustedDeltaY = deltaY / viewportScale;
        const eventParams = {
            type: 'mouseWheel',
            x,
            y,
            deltaX: adjustedDeltaX,
            deltaY: adjustedDeltaY
        };
        // Send to page or session depending on connection type
        if (wsUrl && wsUrl.includes('/page/')) {
            wsRef.current.send(JSON.stringify({
                id: ++messageIdRef.current,
                method: "Input.dispatchMouseEvent",
                params: eventParams
            }));
        }
        else if (sessionIdRef.current) {
            wsRef.current.send(JSON.stringify({
                id: ++messageIdRef.current,
                method: "Input.dispatchMouseEvent",
                params: eventParams,
                sessionId: sessionIdRef.current
            }));
        }
    }, [wsUrl]);
    const stopScreencast = useCallback(() => {
        // Clear screenshot polling interval
        if (screenshotIntervalRef.current) {
            clearInterval(screenshotIntervalRef.current);
            screenshotIntervalRef.current = null;
            console.log("[CDP] Stopped screenshot polling");
        }
        if (wsRef.current) {
            // 只有在連接已建立的情況下才發送停止命令
            if (wsRef.current.readyState === WebSocket.OPEN) {
                try {
                    // 如果是 page-level WebSocket，發送 stopScreencast
                    if (wsUrl && wsUrl.includes('/page/')) {
                        wsRef.current.send(JSON.stringify({
                            id: 999,
                            method: "Page.stopScreencast"
                        }));
                    }
                    else if (sessionIdRef.current) {
                        // 如果是 browser-level with session，detach from target
                        wsRef.current.send(JSON.stringify({
                            id: ++messageIdRef.current,
                            method: "Target.detachFromTarget",
                            params: {
                                sessionId: sessionIdRef.current
                            }
                        }));
                    }
                }
                catch (err) {
                    console.error("[CDP] Failed to send cleanup commands:", err);
                }
            }
            wsRef.current.close();
            wsRef.current = null;
        }
        targetIdRef.current = null;
        sessionIdRef.current = null;
        setIsStreaming(false);
    }, [wsUrl]);
    useEffect(() => {
        return () => {
            stopScreencast();
        };
    }, [stopScreencast]);
    // Render frame to canvas
    useEffect(() => {
        if (!lastFrame || !canvasRef.current) {
            return;
        }
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            console.error("[CDP] Failed to get canvas 2d context");
            return;
        }
        const img = new Image();
        img.onload = () => {
            // Store actual image dimensions for coordinate conversion
            imageWidthRef.current = img.width;
            imageHeightRef.current = img.height;
            if (viewportMetadataRef.current.deviceWidth === 0) {
                updateViewportMetadata({
                    deviceWidth: img.width,
                    deviceHeight: img.height
                });
            }
            // Set canvas internal resolution to match image
            canvas.width = img.width;
            canvas.height = img.height;
            // Draw image
            ctx.drawImage(img, 0, 0);
        };
        img.onerror = (err) => {
            console.error("[CDP] Failed to load image:", err);
        };
        img.src = `data:image/jpeg;base64,${lastFrame.data}`;
    }, [lastFrame]);
    return {
        isStreaming,
        error,
        lastFrame,
        canvasRef,
        startScreencast,
        stopScreencast,
        sendMouseEvent,
        sendKeyEvent,
        sendScrollEvent,
        sendTextInput
    };
}
