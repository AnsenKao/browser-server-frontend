import type { ChatMessage } from "@/types/ui";
import styles from "./MessageList.module.css";

interface MessageListProps {
  messages: ChatMessage[];
}

const roleLabels: Record<ChatMessage["role"], string> = {
  user: "You",
  agent: "Agent",
  system: "System",
  status: "Status"
};

export function MessageList({ messages }: MessageListProps) {
  return (
    <div className={styles.container}>
      {messages.map((message) => (
        <div key={message.id} className={`${styles.message} ${styles[message.role]}`}>
          <div className={styles.meta}>
            <span className={styles.role}>{roleLabels[message.role]}</span>
            <time className={styles.time}>
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
              })}
            </time>
          </div>
          <div className={styles.content}>{message.content}</div>
        </div>
      ))}
    </div>
  );
}

export default MessageList;
