import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import styles from "./TaskControls.module.css";
const statusColors = {
    pending: "#f59e0b",
    running: "#22c55e",
    paused: "#eab308",
    stopped: "#ef4444",
    completed: "#60a5fa",
    failed: "#ef4444"
};
export function TaskControls({ taskId, status, isBusy = false, onPause, onResume, onStop }) {
    const canControl = Boolean(taskId);
    const statusColor = status ? statusColors[status] ?? "#38bdf8" : "#38bdf8";
    return (_jsxs("div", { className: styles.container, children: [_jsxs("div", { className: styles.statusCard, children: [_jsx("span", { className: styles.label, children: "Task ID" }), _jsx("span", { className: styles.value, children: taskId ?? "尚未創建" }), _jsx("span", { className: styles.status, style: { backgroundColor: statusColor }, children: status ?? "idle" })] }), _jsxs("div", { className: styles.actions, children: [_jsx("button", { type: "button", className: styles.button, onClick: () => onPause(), disabled: !canControl || isBusy || status === "paused", children: "\u66AB\u505C" }), _jsx("button", { type: "button", className: styles.button, onClick: () => onResume(), disabled: !canControl || isBusy || status === "running", children: "\u7E7C\u7E8C" }), _jsx("button", { type: "button", className: `${styles.button} ${styles.danger}`, onClick: () => onStop(), disabled: !canControl || isBusy, children: "\u505C\u6B62" })] })] }));
}
export default TaskControls;
