import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import styles from "./ChatInput.module.css";
export function ChatInput({ onSubmit, isDisabled = false }) {
    const [value, setValue] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!value.trim() || isDisabled || isSubmitting) {
            return;
        }
        try {
            setIsSubmitting(true);
            await onSubmit(value.trim());
            setValue("");
        }
        finally {
            setIsSubmitting(false);
        }
    };
    const handleKeyDown = (event) => {
        // Enter 送出，Shift+Enter 换行
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (value.trim() && !isDisabled && !isSubmitting) {
                handleSubmit(event);
            }
        }
    };
    return (_jsxs("form", { className: styles.form, onSubmit: handleSubmit, children: [_jsx("textarea", { className: styles.textarea, value: value, onChange: (event) => setValue(event.target.value), onKeyDown: handleKeyDown, placeholder: "\u8F38\u5165\u4EFB\u52D9\u63CF\u8FF0\u5F8C\u6309 Enter \u9001\u51FA\uFF0CShift+Enter \u63DB\u884C", rows: 3, disabled: isDisabled || isSubmitting }), _jsx("button", { type: "submit", className: styles.button, disabled: isDisabled || isSubmitting, children: isSubmitting ? "Sending…" : "Send" })] }));
}
export default ChatInput;
