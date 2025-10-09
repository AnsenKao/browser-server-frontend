import { useCallback, useMemo } from "react";
import ChatInput from "@/components/ChatInput";
import CdpViewer from "@/components/CdpViewer";
import MessageList from "@/components/MessageList";
import TaskControls from "@/components/TaskControls";
import { useAgentTask, type UseAgentTaskOptions } from "@/hooks/useAgentTask";
import styles from "./App.module.css";

const HELP_TEXT = `指令列表：
• task <描述> [--provider=azure-openai --headless=false --enable_cdp=true]
• task/stream 重新連線 SSE 日誌
• task/pause 暫停任務
• task/resume 恢復任務
• task/stop 停止任務
• clear 清除對話紀錄`;

interface ParsedTaskCommand {
  description: string;
  overrides: Partial<UseAgentTaskOptions>;
}

const parseTaskCommand = (input: string): ParsedTaskCommand => {
  const raw = input.slice(4).trim();
  if (!raw) {
    return { description: "", overrides: {} };
  }

  const [descriptionPart, ...optionSegments] = raw.split("--");
  const description = descriptionPart.trim();
  const overrides: Partial<UseAgentTaskOptions> = {};

  optionSegments.forEach((segment) => {
    const [keyRaw, valueRaw] = segment.trim().split("=");
    const key = keyRaw?.trim();
    const value = valueRaw?.trim();

    if (!key || !value) return;

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
  const {
    messages,
    currentTaskId,
    taskStatus,
    isBusy,
    isStreaming,
    inspectUrl,
    createTask,
    startStream,
    pauseTask,
    resumeTask,
    stopTask,
    appendMessage,
    reset
  } = useAgentTask();

  const statusLabel = useMemo(() => {
    if (!taskStatus) return "idle";
    return taskStatus;
  }, [taskStatus]);

  const handleCommand = useCallback(
    async (rawInput: string) => {
      const input = rawInput.trim();
      if (!input) return;

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
    },
    [appendMessage, createTask, pauseTask, reset, resumeTask, startStream, stopTask]
  );

  return (
    <div className={styles.app}>
      <section className={styles.chatPane}>
        <header className={styles.chatHeader}>
          <h1>Browser Agent 控制中心</h1>
          <div className={styles.statusBar}>
            <span
              className={`${styles.statusDot} ${isStreaming ? styles.statusDotActive : ""}`}
            />
            <span>串流狀態：{isStreaming ? "監看中" : "未連線"}</span>
            <span>任務狀態：{statusLabel}</span>
          </div>
          <p>使用指令如 <code>task 去 Google 搜索 FastAPI</code> 或輸入 <code>help</code> 查看所有指令。</p>
        </header>
        <div className={styles.messagesWrapper}>
          <MessageList messages={messages} />
        </div>
        <TaskControls
          taskId={currentTaskId}
          status={taskStatus}
          isBusy={isBusy}
          onPause={pauseTask}
          onResume={resumeTask}
          onStop={stopTask}
        />
        <ChatInput onSubmit={handleCommand} isDisabled={isBusy} />
      </section>
      <section className={styles.previewPane}>
        <CdpViewer
          inspectUrl={inspectUrl ?? undefined}
          fallbackUrl={cdpFallbackUrl}
          isEnabled={Boolean(currentTaskId)}
          taskId={currentTaskId}
        />
      </section>
    </div>
  );
}

export default App;

export { parseTaskCommand };
