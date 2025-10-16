const defaultHeaders = {
    "Content-Type": "application/json"
};
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const withBase = (path) => {
    if (API_BASE_URL === "/api" && path.startsWith("/")) {
        return `${API_BASE_URL}${path}`;
    }
    return `${API_BASE_URL}${path}`;
};
const handleResponse = async (response) => {
    if (!response.ok) {
        let errorMessage = response.statusText;
        try {
            const errorText = await response.text();
            // 嘗試解析 JSON 錯誤訊息
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.detail || errorJson.error || errorJson.message || errorText;
            }
            catch {
                // 不是 JSON，使用原始文字
                errorMessage = errorText || response.statusText;
            }
        }
        catch {
            // 無法讀取 response body
            errorMessage = response.statusText;
        }
        throw new Error(`[${response.status}] ${errorMessage}`);
    }
    if (response.status === 204) {
        return undefined;
    }
    return (await response.json());
};
export const createAgentTask = async (payload) => {
    const response = await fetch(withBase("/agents/create"), {
        method: "POST",
        headers: defaultHeaders,
        body: JSON.stringify(payload)
    });
    return handleResponse(response);
};
export const controlAgentTask = async (taskId, action) => {
    const response = await fetch(withBase(`/agents/${taskId}/${action}`), {
        method: "POST",
        headers: defaultHeaders
    });
    return handleResponse(response);
};
export const stopAgentTask = async (taskId) => {
    await fetch(withBase(`/agents/${taskId}`), {
        method: "DELETE",
        headers: defaultHeaders
    });
};
export const getAgentStatus = async (taskId) => {
    const response = await fetch(withBase(`/agents/${taskId}/status`));
    return handleResponse(response);
};
export const getCdpInfo = async () => {
    const response = await fetch(withBase("/cdp"));
    return handleResponse(response);
};
export const getTaskWebSocket = async (taskId) => {
    const response = await fetch(withBase(`/agents/${taskId}/websocket`));
    return handleResponse(response);
};
export const createTaskEventSource = (taskId) => {
    const streamUrl = withBase(`/agents/${taskId}/stream`);
    return new EventSource(streamUrl);
};
export const parseStreamEvent = (data) => {
    try {
        return JSON.parse(data);
    }
    catch (error) {
        console.error("Failed to parse stream event", error);
        return null;
    }
};
