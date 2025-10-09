import { jsx as _jsx } from "react/jsx-runtime";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App, { parseTaskCommand } from "./App";
vi.mock("@/hooks/useAgentTask", () => {
    const mockFn = vi.fn();
    return {
        useAgentTask: () => ({
            messages: [],
            currentTaskId: null,
            taskStatus: null,
            isBusy: false,
            isStreaming: false,
            inspectUrl: null,
            createTask: mockFn,
            startStream: mockFn,
            pauseTask: mockFn,
            resumeTask: mockFn,
            stopTask: mockFn,
            appendMessage: mockFn,
            reset: mockFn
        })
    };
});
describe("App", () => {
    it("renders chat controls", () => {
        render(_jsx(App, {}));
        expect(screen.getByText(/Browser Agent 控制中心/)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/輸入指令/)).toBeInTheDocument();
    });
});
describe("parseTaskCommand", () => {
    it("parses description and overrides", () => {
        const { description, overrides } = parseTaskCommand("task 搜尋最新 FastAPI --model=gemini --headless=false --max_steps=50");
        expect(description).toBe("搜尋最新 FastAPI");
        expect(overrides).toMatchObject({
            model: "gemini",
            headless: false,
            max_steps: 50
        });
    });
    it("returns empty description when missing", () => {
        const { description } = parseTaskCommand("task   ");
        expect(description).toBe("");
    });
});
