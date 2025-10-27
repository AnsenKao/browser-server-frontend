import { ChangeEvent, FormEvent, KeyboardEvent, useState } from "react";
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

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 送出，Shift+Enter 换行
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (value.trim() && !isDisabled && !isSubmitting) {
        handleSubmit(event as unknown as FormEvent<HTMLFormElement>);
      }
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <textarea
        className={styles.textarea}
        value={value}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="輸入任務描述後按 Enter 送出，Shift+Enter 換行"
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
