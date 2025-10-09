import styles from "./TaskControls.module.css";

interface TaskControlsProps {
  taskId?: string | null;
  status?: string | null;
  isBusy?: boolean;
  onPause: () => Promise<void> | void;
  onResume: () => Promise<void> | void;
  onStop: () => Promise<void> | void;
}

const statusColors: Record<string, string> = {
  pending: "#f59e0b",
  running: "#22c55e",
  paused: "#eab308",
  stopped: "#ef4444",
  completed: "#60a5fa",
  failed: "#ef4444"
};

export function TaskControls({
  taskId,
  status,
  isBusy = false,
  onPause,
  onResume,
  onStop
}: TaskControlsProps) {
  const canControl = Boolean(taskId);
  const statusColor = status ? statusColors[status] ?? "#38bdf8" : "#38bdf8";

  return (
    <div className={styles.container}>
      <div className={styles.statusCard}>
        <span className={styles.label}>Task ID</span>
        <span className={styles.value}>{taskId ?? "尚未創建"}</span>
        <span className={styles.status} style={{ backgroundColor: statusColor }}>
          {status ?? "idle"}
        </span>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          onClick={() => onPause()}
          disabled={!canControl || isBusy || status === "paused"}
        >
          暫停
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => onResume()}
          disabled={!canControl || isBusy || status === "running"}
        >
          繼續
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.danger}`}
          onClick={() => onStop()}
          disabled={!canControl || isBusy}
        >
          停止
        </button>
      </div>
    </div>
  );
}

export default TaskControls;
