export interface ScreencastFrame {
  data: string; // base64 encoded image
  sessionId: number;
  metadata: {
    timestamp: number;
    deviceWidth: number;
    deviceHeight: number;
    pageScaleFactor: number;
  };
}

export interface CDPInfo {
  cdp_enabled: boolean;
  cdp_endpoint: string;
  browser_info?: {
    webSocketDebuggerUrl?: string;
  };
  pages?: Array<{
    id: string;
    url: string;
    websocket_url?: string;
  }>;
}
