export interface TaskResponse {
  success: boolean;
  task_id?: string | null;
  status?: string | null;
  result?: string | null;
  error?: string | null;
  current_step?: number | null;
  total_steps?: number | null;
  inspect_url?: string | null;
  cdp_info?: Record<string, unknown> | null;
}

export interface AgentStatusResponse {
  task_id: string;
  status: string;
  task_description: string;
  created_at: number;
  started_at?: number | null;
  completed_at?: number | null;
  current_step?: number;
  total_steps?: number;
  result?: string | null;
  error?: string | null;
  progress_percentage?: number;
  duration?: number | null;
}

export interface BrowserTaskPayload {
  task: string;
  model?: string;
  provider?: string;
  headless?: boolean;
  max_steps?: number;
  enable_cdp?: boolean;
  cdp_port?: number;
}

export type AgentControlAction = "pause" | "resume" | "stop";

export interface StreamConnectedEvent {
  type: "connected";
  task_id: string;
  message: string;
}

export interface StreamLogEvent {
  type: "log";
  task_id: string;
  status?: string;
  current_step?: number;
  progress?: number;
  log: {
    step: number;
    action: string;
    details?: string | null;
    type: string;
    timestamp: number;
  };
}

export interface StreamDoneEvent {
  type: "done";
  task_id: string;
  status: string;
  result?: string | null;
  total_steps?: number;
  duration?: number;
}

export interface StreamErrorEvent {
  type: "error";
  task_id: string;
  message: string;
}

export type StreamEvent =
  | StreamConnectedEvent
  | StreamLogEvent
  | StreamDoneEvent
  | StreamErrorEvent;
