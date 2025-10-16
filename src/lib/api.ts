import type {
  AgentControlAction,
  AgentStatusResponse,
  BrowserTaskPayload,
  StreamEvent,
  TaskResponse
} from "@/types/api";

const defaultHeaders: HeadersInit = {
  "Content-Type": "application/json"
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";

const withBase = (path: string) => {
  if (API_BASE_URL === "/api" && path.startsWith("/")) {
    return `${API_BASE_URL}${path}`;
  }

  return `${API_BASE_URL}${path}`;
};

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    let errorMessage = response.statusText;
    
    try {
      const errorText = await response.text();
      
      // 嘗試解析 JSON 錯誤訊息
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.detail || errorJson.error || errorJson.message || errorText;
      } catch {
        // 不是 JSON，使用原始文字
        errorMessage = errorText || response.statusText;
      }
    } catch {
      // 無法讀取 response body
      errorMessage = response.statusText;
    }
    
    throw new Error(`[${response.status}] ${errorMessage}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

export const createAgentTask = async (
  payload: BrowserTaskPayload
): Promise<TaskResponse> => {
  const response = await fetch(withBase("/agents/create"), {
    method: "POST",
    headers: defaultHeaders,
    body: JSON.stringify(payload)
  });

  return handleResponse<TaskResponse>(response);
};

export const controlAgentTask = async (
  taskId: string,
  action: AgentControlAction
): Promise<TaskResponse> => {
  const response = await fetch(withBase(`/agents/${taskId}/${action}`), {
    method: "POST",
    headers: defaultHeaders
  });

  return handleResponse<TaskResponse>(response);
};

export const stopAgentTask = async (taskId: string): Promise<void> => {
  await fetch(withBase(`/agents/${taskId}`), {
    method: "DELETE",
    headers: defaultHeaders
  });
};

export const getAgentStatus = async (
  taskId: string
): Promise<AgentStatusResponse> => {
  const response = await fetch(withBase(`/agents/${taskId}/status`));
  return handleResponse<AgentStatusResponse>(response);
};

export const getCdpInfo = async (): Promise<Record<string, unknown>> => {
  const response = await fetch(withBase("/cdp"));
  return handleResponse<Record<string, unknown>>(response);
};

export const getTaskWebSocket = async (
  taskId: string
): Promise<import("@/types/api").TaskWebSocketResponse> => {
  const response = await fetch(withBase(`/agents/${taskId}/websocket`));
  return handleResponse<import("@/types/api").TaskWebSocketResponse>(response);
};

export const createTaskEventSource = (taskId: string): EventSource => {
  const streamUrl = withBase(`/agents/${taskId}/stream`);
  return new EventSource(streamUrl);
};

export const parseStreamEvent = (data: string): StreamEvent | null => {
  try {
    return JSON.parse(data) as StreamEvent;
  } catch (error) {
    console.error("Failed to parse stream event", error);
    return null;
  }
};
