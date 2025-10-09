import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  controlAgentTask,
  createAgentTask,
  createTaskEventSource,
  getAgentStatus,
  parseStreamEvent
} from "@/lib/api";
import { createId } from "@/lib/id";
import type { BrowserTaskPayload, StreamEvent, TaskResponse } from "@/types/api";
import type { ChatMessage, MessageRole } from "@/types/ui";

export interface UseAgentTaskOptions {
  model?: string;
  provider?: string;
  headless?: boolean;
  enable_cdp?: boolean;
  max_steps?: number;
}

interface UseAgentTaskResult {
  messages: ChatMessage[];
  currentTaskId: string | null;
  taskStatus: string | null;
  isBusy: boolean;
  isStreaming: boolean;
  inspectUrl: string | null;
  createTask: (description: string, overrides?: Partial<UseAgentTaskOptions>) => Promise<TaskResponse>;
  startStream: (taskId?: string | null) => Promise<void>;
  pauseTask: () => Promise<void>;
  resumeTask: () => Promise<void>;
  stopTask: () => Promise<void>;
  appendMessage: (role: MessageRole, content: string) => void;
  reset: () => void;
}

const DEFAULT_MODEL = import.meta.env.VITE_DEFAULT_MODEL;
const DEFAULT_PROVIDER = import.meta.env.VITE_DEFAULT_PROVIDER ?? "azure-openai";

const DEFAULT_OPTIONS: UseAgentTaskOptions = {
  headless: false,
  enable_cdp: true,
  max_steps: 20
};

export function useAgentTask(): UseAgentTaskResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [inspectUrl, setInspectUrl] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const latestTaskId = useRef<string | null>(null);

  const pushMessage = useCallback((role: MessageRole, content: string) => {
    setMessages((prev: ChatMessage[]) => [
      ...prev,
      {
        id: createId(),
        role,
        content,
        timestamp: Date.now()
      }
    ]);
  }, []);

  const stopStreaming = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setIsStreaming(false);
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
    setCurrentTaskId(null);
    setTaskStatus(null);
    setInspectUrl(null);
    stopStreaming();
  }, [stopStreaming]);

  const handleStreamEvent = useCallback(
    (event: StreamEvent) => {
      switch (event.type) {
        case "connected": {
          setTaskStatus("running");
          pushMessage("status", event.message ?? "SSE 已連線。");
          break;
        }
        case "log": {
          setTaskStatus(event.status ?? "running");
          const { log } = event;
          const details = log.details ? `\n${log.details}` : "";
          pushMessage("agent", `步驟 ${log.step}: ${log.action}${details}`);
          break;
        }
        case "done": {
          setTaskStatus(event.status);
          const summary = event.result ? `結果：${event.result}` : "任務已完成";
          pushMessage("status", summary);
          stopStreaming();
          break;
        }
        case "error": {
          setTaskStatus("failed");
          pushMessage("system", event.message);
          stopStreaming();
          break;
        }
        default:
          break;
      }
    },
    [pushMessage, stopStreaming]
  );

  const startStream = useCallback(
    async (taskId: string | null = null) => {
      const id = taskId ?? latestTaskId.current;

      if (!id) {
        pushMessage("system", "目前沒有任務可供串流。請先建立任務。");
        return;
      }

      stopStreaming();
      setIsStreaming(true);

      const source = createTaskEventSource(id);
      eventSourceRef.current = source;

      pushMessage("status", `開始監看任務 ${id} 的實時日誌。`);

      source.onmessage = (event) => {
        if (!event.data) return;
        const parsed = parseStreamEvent(event.data);
        if (!parsed) return;
        handleStreamEvent(parsed);
      };

      source.onerror = () => {
        pushMessage("system", "SSE 連線中斷，稍後可再次輸入 task/stream 重新連接。");
        stopStreaming();
      };
    },
    [handleStreamEvent, pushMessage, stopStreaming]
  );

  const createTask = useCallback(
    async (description: string, overrides: Partial<UseAgentTaskOptions> = {}) => {
      setIsBusy(true);

      const payload: BrowserTaskPayload = {
        task: description,
        ...DEFAULT_OPTIONS,
        ...overrides
      };

      if (!payload.provider) {
        payload.provider = DEFAULT_PROVIDER;
      }

      if (!payload.model && DEFAULT_MODEL) {
        payload.model = DEFAULT_MODEL;
      }

      if (!payload.model) {
        delete payload.model;
      }

      try {
        pushMessage("user", description);
        const response = await createAgentTask(payload);

        if (!response.success) {
          const errorMsg = response.error ?? "任務創建失敗";
          pushMessage("system", `❌ ${errorMsg}`);
          throw new Error(errorMsg);
        }

        const taskId = response.task_id ?? null;
        setCurrentTaskId(taskId);
        latestTaskId.current = taskId;
        setTaskStatus(response.status ?? "pending");
        setInspectUrl(response.inspect_url ?? null);

        pushMessage(
          "system",
          `任務已建立，ID：${response.task_id ?? "未知"}。自動開始監看日誌。`
        );

        // Start streaming immediately without awaiting to avoid blocking UI
        if (taskId) {
          // Use setTimeout to ensure state is updated before streaming
          setTimeout(() => {
            startStream(taskId).catch((err) => {
              console.error("Failed to start stream:", err);
              pushMessage("system", `自動啟動日誌串流失敗: ${err instanceof Error ? err.message : String(err)}`);
            });
          }, 100);
        }

        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : "任務建立時發生錯誤";
        // Only show error if not already shown
        if (!message.startsWith("❌")) {
          pushMessage("system", `❌ ${message}`);
        }
        console.error("Failed to create task:", error);
        throw error;
      } finally {
        setIsBusy(false);
      }
    },
    [pushMessage, startStream]
  );

  const pauseTask = useCallback(async () => {
    if (!currentTaskId) {
      pushMessage("system", "尚未建立任務");
      return;
    }

    setIsBusy(true);
    try {
      const response = await controlAgentTask(currentTaskId, "pause");
      setTaskStatus(response.status ?? "paused");
      pushMessage("status", "任務已暫停");
    } catch (error) {
      const message = error instanceof Error ? error.message : "暫停任務失敗";
      pushMessage("system", message);
    } finally {
      setIsBusy(false);
    }
  }, [currentTaskId, pushMessage]);

  const resumeTask = useCallback(async () => {
    if (!currentTaskId) {
      pushMessage("system", "尚未建立任務");
      return;
    }

    setIsBusy(true);
    try {
      const response = await controlAgentTask(currentTaskId, "resume");
      setTaskStatus(response.status ?? "running");
      pushMessage("status", "任務已恢復");
    } catch (error) {
      const message = error instanceof Error ? error.message : "恢復任務失敗";
      pushMessage("system", message);
    } finally {
      setIsBusy(false);
    }
  }, [currentTaskId, pushMessage]);

  const stopTask = useCallback(async () => {
    if (!currentTaskId) {
      pushMessage("system", "尚未建立任務");
      return;
    }

    setIsBusy(true);
    try {
      const response = await controlAgentTask(currentTaskId, "stop");
      setTaskStatus(response.status ?? "stopped");
      pushMessage("status", "任務已送出停止指令");
      stopStreaming();
    } catch (error) {
      const message = error instanceof Error ? error.message : "停止任務失敗";
      pushMessage("system", message);
    } finally {
      setIsBusy(false);
    }
  }, [currentTaskId, pushMessage, stopStreaming]);

  const appendMessage = useCallback(
    (role: MessageRole, content: string) => {
      pushMessage(role, content);
    },
    [pushMessage]
  );

  useEffect(() => {
    return () => {
      stopStreaming();
    };
  }, [stopStreaming]);

  useEffect(() => {
    const id = currentTaskId;
    if (!id) return;

    let isMounted = true;

    (async () => {
      try {
        const status = await getAgentStatus(id);
        if (!isMounted) return;
        setTaskStatus(status.status);
      } catch (error) {
        console.warn("Failed to fetch agent status", error);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [currentTaskId]);

  return useMemo(
    () => ({
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
    }),
    [
      appendMessage,
      createTask,
      currentTaskId,
      inspectUrl,
      isBusy,
      isStreaming,
      messages,
      pauseTask,
      reset,
      resumeTask,
      startStream,
      stopTask,
      taskStatus
    ]
  );
}
