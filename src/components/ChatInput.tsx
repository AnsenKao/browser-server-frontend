import { ChangeEvent, FormEvent, useState } from "react";
import styles from "./ChatInput.module.css";

interface ChatInputProps {
  onSubmit: (value: string) => Promise<void> | void;
  isDisabled?: boolean;
}

export function ChatInput({ onSubmit, isDisabled = false }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!value.trim() || isDisabled || isSubmitting) {
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit(value.trim());
      setValue("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <textarea
        className={styles.textarea}
        value={value}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setValue(event.target.value)}
        placeholder="輸入指令，例如：task 搜尋最新的 FastAPI 教學 或 task/stream"
        rows={3}
        disabled={isDisabled || isSubmitting}
      />
      <button type="submit" className={styles.button} disabled={isDisabled || isSubmitting}>
        {isSubmitting ? "Sending…" : "Send"}
      </button>
    </form>
  );
}

export default ChatInput;
