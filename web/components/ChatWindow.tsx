"use client";

import { useEffect, useRef, useState } from "react";
import { createSession, sendMessage, type ChatMessage } from "@/lib/api";

const AGENT_COLORS: Record<string, string> = {
  "Billing Agent": "text-amber-400",
  "Technical Support Agent": "text-cyan-400",
  Router: "text-gray-400",
};

const SUGGESTED_QUESTIONS = [
  "What is my current invoice status?",
  "I'm getting an API rate limit error",
  "Can I get a discount on my subscription?",
  "SSO login isn't working for my team",
  "Show me your available plans",
];

export default function ChatWindow() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    createSession().then(setSessionId).catch(() => setError("Failed to connect to support service."));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSend(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || !sessionId || loading) return;

    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setLoading(true);

    try {
      const res = await sendMessage(sessionId, msg);
      setActiveAgent(res.agent);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.answer, agent: res.agent },
      ]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto">
      {/* Header */}
      <div className="border-b border-gray-800 p-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="font-semibold text-lg">Customer Support</h1>
          <p className="text-xs text-gray-500">Powered by Azure OpenAI · Semantic Kernel</p>
        </div>
        {activeAgent && (
          <span className={`text-xs font-mono px-2 py-1 rounded bg-gray-800 ${AGENT_COLORS[activeAgent] ?? "text-gray-400"}`}>
            {activeAgent}
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="space-y-4 mt-8">
            <p className="text-center text-gray-500 text-sm">How can we help you today?</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSend(q)}
                  className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-full transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] ${msg.role === "user" ? "order-1" : ""}`}>
              {msg.role === "assistant" && msg.agent && (
                <p className={`text-[10px] font-mono mb-1 ${AGENT_COLORS[msg.agent] ?? "text-gray-400"}`}>
                  {msg.agent}
                </p>
              )}
              <div
                className={`rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-gray-800 text-gray-100 rounded-bl-sm"
                }`}
              >
                {msg.content}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1 items-center h-4">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="text-center text-red-400 text-xs">{error}</p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-800 p-4 shrink-0">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={!sessionId || loading}
            className="flex-1 bg-gray-800 rounded-xl px-4 py-2.5 text-sm placeholder:text-gray-500 outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || !sessionId || loading}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            Send
          </button>
        </form>
        {!sessionId && !error && (
          <p className="text-xs text-gray-500 mt-1 text-center">Connecting...</p>
        )}
      </div>
    </div>
  );
}
