import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo } from "react";
import ChatInput from "@/components/ChatInput";
import CdpViewer from "@/components/CdpViewer";
import MessageList from "@/components/MessageList";
import TaskControls from "@/components/TaskControls";
import { useAgentTask } from "@/hooks/useAgentTask";
import styles from "./App.module.css";
const HELP_TEXT = `指令列表：
• task <描述> [--provider=azure-openai --headless=false --enable_cdp=true]
• task/stream 重新連線 SSE 日誌
• task/pause 暫停任務
• task/resume 恢復任務
• task/stop 停止任務
• clear 清除對話紀錄`;
const parseTaskCommand = (input) => {
    const raw = input.slice(4).trim();
    if (!raw) {
        return { description: "", overrides: {} };
    }
    const [descriptionPart, ...optionSegments] = raw.split("--");
    const description = descriptionPart.trim();
    const overrides = {};
    optionSegments.forEach((segment) => {
        const [keyRaw, valueRaw] = segment.trim().split("=");
        const key = keyRaw?.trim();
        const value = valueRaw?.trim();
        if (!key || !value)
            return;
        switch (key) {
            case "model":
                overrides.model = value;
                break;
            case "provider":
                overrides.provider = value;
                break;
            case "headless":
                overrides.headless = value === "true";
                break;
            case "enable_cdp":
                overrides.enable_cdp = value === "true";
                break;
            case "max_steps": {
                const parsed = Number(value);
                if (!Number.isNaN(parsed)) {
                    overrides.max_steps = parsed;
                }
                break;
            }
            default:
                break;
        }
    });
    return { description, overrides };
};
const cdpFallbackUrl = import.meta.env.VITE_CDP_URL ?? "http://localhost:9222";
function App() {
    const { messages, currentTaskId, taskStatus, isBusy, isStreaming, inspectUrl, createTask, startStream, pauseTask, resumeTask, stopTask, appendMessage, reset } = useAgentTask();
    const statusLabel = useMemo(() => {
        if (!taskStatus)
            return "idle";
        return taskStatus;
    }, [taskStatus]);
    const handleCommand = useCallback(async (rawInput) => {
        const input = rawInput.trim();
        if (!input)
            return;
        const normalized = input.toLowerCase();
        if (normalized === "help") {
            appendMessage("system", HELP_TEXT);
            return;
        }
        if (normalized === "clear") {
            reset();
            appendMessage("system", "對話已清除。");
            return;
        }
        if (normalized.startsWith("task/stream")) {
            appendMessage("user", input);
            await startStream();
            return;
        }
        if (normalized.startsWith("task/pause")) {
            appendMessage("user", input);
            await pauseTask();
            return;
        }
        if (normalized.startsWith("task/resume")) {
            appendMessage("user", input);
            await resumeTask();
            return;
        }
        if (normalized.startsWith("task/stop")) {
            appendMessage("user", input);
            await stopTask();
            return;
        }
        if (normalized.startsWith("task")) {
            const { description, overrides } = parseTaskCommand(input);
            if (!description) {
                appendMessage("system", "請提供任務描述，例如：task 搜尋最新的 FastAPI 教學");
                return;
            }
            await createTask(description, overrides);
            return;
        }
        appendMessage("system", `無法辨識指令：${input}。輸入 help 查看支援的指令。`);
    }, [appendMessage, createTask, pauseTask, reset, resumeTask, startStream, stopTask]);
    return (_jsxs("div", { className: styles.app, children: [_jsxs("section", { className: styles.chatPane, children: [_jsxs("header", { className: styles.chatHeader, children: [_jsx("h1", { children: "Browser Agent \u63A7\u5236\u4E2D\u5FC3" }), _jsxs("div", { className: styles.statusBar, children: [_jsx("span", { className: `${styles.statusDot} ${isStreaming ? styles.statusDotActive : ""}` }), _jsxs("span", { children: ["\u4E32\u6D41\u72C0\u614B\uFF1A", isStreaming ? "監看中" : "未連線"] }), _jsxs("span", { children: ["\u4EFB\u52D9\u72C0\u614B\uFF1A", statusLabel] })] }), _jsxs("p", { children: ["\u4F7F\u7528\u6307\u4EE4\u5982 ", _jsx("code", { children: "task \u53BB Google \u641C\u7D22 FastAPI" }), " \u6216\u8F38\u5165 ", _jsx("code", { children: "help" }), " \u67E5\u770B\u6240\u6709\u6307\u4EE4\u3002"] })] }), _jsx("div", { className: styles.messagesWrapper, children: _jsx(MessageList, { messages: messages }) }), _jsx(TaskControls, { taskId: currentTaskId, status: taskStatus, isBusy: isBusy, onPause: pauseTask, onResume: resumeTask, onStop: stopTask }), _jsx(ChatInput, { onSubmit: handleCommand, isDisabled: isBusy })] }), _jsx("section", { className: styles.previewPane, children: _jsx(CdpViewer, { inspectUrl: inspectUrl ?? undefined, fallbackUrl: cdpFallbackUrl, isEnabled: Boolean(currentTaskId), taskId: currentTaskId }) })] }));
}
export default App;
export { parseTaskCommand };
