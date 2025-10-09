import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import styles from "./MessageList.module.css";
const roleLabels = {
    user: "You",
    agent: "Agent",
    system: "System",
    status: "Status"
};
export function MessageList({ messages }) {
    return (_jsx("div", { className: styles.container, children: messages.map((message) => (_jsxs("div", { className: `${styles.message} ${styles[message.role]}`, children: [_jsxs("div", { className: styles.meta, children: [_jsx("span", { className: styles.role, children: roleLabels[message.role] }), _jsx("time", { className: styles.time, children: new Date(message.timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit"
                            }) })] }), _jsx("div", { className: styles.content, children: message.content })] }, message.id))) }));
}
export default MessageList;
