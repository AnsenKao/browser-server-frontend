import { useCallback, useEffect, useRef, useState } from "react";
import type { ScreencastFrame } from "@/types/cdp";

interface UseCDPScreencastOptions {
  wsUrl: string | null;
  enabled: boolean;
}

export function useCDPScreencast({ wsUrl, enabled }: UseCDPScreencastOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFrame, setLastFrame] = useState<ScreencastFrame | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenshotIntervalRef = useRef<number | null>(null);
  const targetIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null); // Session ID for flatten mode
  const messageIdRef = useRef<number>(100); // Start from 100 to avoid conflicts
  const imageWidthRef = useRef<number>(0); // Store actual image dimensions
  const imageHeightRef = useRef<number>(0);

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
        } else {
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
          
          // Handle Target.getTargets response
          if (message.result && message.result.targetInfos) {
            const targets = message.result.targetInfos || [];
            
            // Find first page target
            const pageTarget = targets.find((t: any) => t.type === 'page');
            
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
            } else {
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
            const frame: ScreencastFrame = {
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
            const frame: ScreencastFrame = {
              data: message.params.data,
              sessionId: message.params.sessionId,
              metadata: message.params.metadata
            };

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
        } catch (err) {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      setIsStreaming(false);
    }
  }, [wsUrl, enabled]);

  // Send user input events to browser
  const sendMouseEvent = useCallback((type: 'mousePressed' | 'mouseReleased' | 'mouseMoved', x: number, y: number, button?: 'left' | 'right' | 'middle') => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Convert canvas coordinates to page coordinates
    // Use the actual image dimensions stored when rendering
    const rect = canvas.getBoundingClientRect();
    const scaleX = imageWidthRef.current / rect.width;
    const scaleY = imageHeightRef.current / rect.height;
    
    const pageX = Math.round(x * scaleX);
    const pageY = Math.round(y * scaleY);

    const eventParams = {
      type,
      x: pageX,
      y: pageY,
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
    } else if (sessionIdRef.current) {
      wsRef.current.send(JSON.stringify({
        id: ++messageIdRef.current,
        method: "Input.dispatchMouseEvent",
        params: eventParams,
        sessionId: sessionIdRef.current
      }));
    }
  }, [wsUrl]);

  // Send text input directly to browser
  const sendTextInput = useCallback((text: string) => {
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
    } else if (sessionIdRef.current) {
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

  const sendKeyEvent = useCallback((type: 'keyDown' | 'keyUp' | 'char', key: string, code?: string, text?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[CDP] WebSocket not ready for key event');
      return;
    }

    console.log('[CDP] Sending key event:', { type, key, code, text });

    const eventParams: any = {
      type,
    };

    // For keyDown/keyUp events
    if (type === 'keyDown' || type === 'keyUp') {
      eventParams.key = key;
      if (code) {
        eventParams.code = code;
      }
      
      // Add windowsVirtualKeyCode for better compatibility (CDP requires this)
      const windowsVirtualKeyCodeMap: { [key: string]: number } = {
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
      } else if (key.length === 1) {
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
    } else if (sessionIdRef.current) {
      wsRef.current.send(JSON.stringify({
        id: ++messageIdRef.current,
        method: "Input.dispatchKeyEvent",
        params: eventParams,
        sessionId: sessionIdRef.current
      }));
    }
  }, [wsUrl]);

  const sendScrollEvent = useCallback((deltaX: number, deltaY: number, x: number, y: number) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Convert canvas coordinates to page coordinates
    // Use the actual image dimensions stored when rendering
    const rect = canvas.getBoundingClientRect();
    const scaleX = imageWidthRef.current / rect.width;
    const scaleY = imageHeightRef.current / rect.height;
    
    const pageX = Math.round(x * scaleX);
    const pageY = Math.round(y * scaleY);

    const eventParams = {
      type: 'mouseWheel',
      x: pageX,
      y: pageY,
      deltaX,
      deltaY
    };

    // Send to page or session depending on connection type
    if (wsUrl && wsUrl.includes('/page/')) {
      wsRef.current.send(JSON.stringify({
        id: ++messageIdRef.current,
        method: "Input.dispatchMouseEvent",
        params: eventParams
      }));
    } else if (sessionIdRef.current) {
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
          } else if (sessionIdRef.current) {
            // 如果是 browser-level with session，detach from target
            wsRef.current.send(JSON.stringify({
              id: ++messageIdRef.current,
              method: "Target.detachFromTarget",
              params: {
                sessionId: sessionIdRef.current
              }
            }));
          }
        } catch (err) {
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
