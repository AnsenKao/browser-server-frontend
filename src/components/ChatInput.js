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
    return (_jsxs("form", { className: styles.form, onSubmit: handleSubmit, children: [_jsx("textarea", { className: styles.textarea, value: value, onChange: (event) => setValue(event.target.value), placeholder: "\u8F38\u5165\u6307\u4EE4\uFF0C\u4F8B\u5982\uFF1Atask \u641C\u5C0B\u6700\u65B0\u7684 FastAPI \u6559\u5B78 \u6216 task/stream", rows: 3, disabled: isDisabled || isSubmitting }), _jsx("button", { type: "submit", className: styles.button, disabled: isDisabled || isSubmitting, children: isSubmitting ? "Sending…" : "Send" })] }));
}
export default ChatInput;
