export type MessageRole = "user" | "system" | "agent" | "status";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
}
