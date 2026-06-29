"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createSession, sendMessage, type AuthUser } from "@/lib/api";
import { AGENT_DEFS, AGENT_ORDER, hexToRgb, type AgentId, type AgentStatus } from "@/lib/mockFlows";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
  agentId?: AgentId;
}

interface PipelineStep {
  label: string;
  detail: string;
  status: "pending" | "active" | "complete";
}

type AgentStatuses = Record<AgentId, AgentStatus>;
type AgentTraces = Record<AgentId, Array<{ fn: string; result: string; msLabel: string }>>;

// ─── Constants ────────────────────────────────────────────────────────────────

const INITIAL_STATUSES: AgentStatuses = {
  router: "idle", billing: "idle", tech: "idle",
  order: "idle", returns: "idle", knowledge: "idle", human: "idle",
};
const INITIAL_TRACES: AgentTraces = {
  router: [], billing: [], tech: [], order: [], returns: [], knowledge: [], human: [],
};

const WELCOME_MESSAGE: Message = {
  id: 0,
  role: "assistant",
  text: "Hello! I'm your AI support assistant.\n\nI can help with **billing questions**, **technical issues**, **order tracking**, **returns**, and more. What can I help you with today?",
};

const QUICK_PROMPTS = [
  "Why is my bill higher this month?",
  "My internet keeps disconnecting",
  "Where is my recent order?",
  "I want to return my device",
];

// Optimistic pipeline shown while the API call is in flight
const PENDING_PIPELINE: PipelineStep[] = [
  { label: "Input Received",      detail: "Message tokenized",     status: "complete" },
  { label: "Router Analysis",     detail: "Classifying intent…",   status: "active"   },
  { label: "Delegating…",         detail: "Waiting for agent",     status: "pending"  },
  { label: "Tool Execution",      detail: "",                       status: "pending"  },
  { label: "Response Generation", detail: "",                       status: "pending"  },
  { label: "Delivered",           detail: "",                       status: "pending"  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function formatSessionId(uuid: string): string {
  return "SES-" + uuid.replace(/-/g, "").slice(0, 6).toUpperCase();
}

function FormattedText({ text }: { text: string }) {
  const paras = text.split("\n\n");
  return (
    <span>
      {paras.map((para, pi) => (
        <React.Fragment key={pi}>
          {pi > 0 && <><br /><br /></>}
          <span>
            {para.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((tok, ti) => {
              if (tok.startsWith("**") && tok.endsWith("**"))
                return <strong key={ti} style={{ fontWeight: 600, color: "#f0f6ff" }}>{tok.slice(2, -2)}</strong>;
              if (tok.startsWith("`") && tok.endsWith("`"))
                return (
                  <code key={ti} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", background: "rgba(14,165,233,0.12)", padding: "1px 5px", borderRadius: "3px", color: "#7cc4e8" }}>
                    {tok.slice(1, -1)}
                  </code>
                );
              return tok || null;
            })}
          </span>
        </React.Fragment>
      ))}
    </span>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: "12px" }}>
      <div style={{ background: "#111f38", border: "1px solid #1e3a5f", borderRadius: "4px 16px 16px 16px", padding: "11px 16px", display: "flex", alignItems: "center", gap: "5px" }}>
        {[0, 0.18, 0.36].map((delay, i) => (
          <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#0ea5e9", animation: `pulseDot 0.9s ease-in-out ${delay}s infinite` }} />
        ))}
      </div>
    </div>
  );
}

function PipelineTrace({ steps }: { steps: PipelineStep[] }) {
  if (steps.length === 0) {
    return <div style={{ font: "400 11px 'JetBrains Mono'", color: "#2a4a6a", padding: "2px 0" }}>Waiting for first message…</div>;
  }
  return (
    <div>
      {steps.map((s, i) => {
        const isC = s.status === "complete", isA = s.status === "active", isP = s.status === "pending";
        return (
          <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start", opacity: isP ? 0.32 : 1, transition: "opacity 0.4s" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "14px", flexShrink: 0 }}>
              <div style={{ width: "9px", height: "9px", borderRadius: "50%", flexShrink: 0, marginTop: "2px", background: isC ? "#06d6a0" : isA ? "#0ea5e9" : "#1e3a5f", boxShadow: isA ? "0 0 9px #0ea5e9" : "none", transition: "all 0.3s", animation: isA ? "pulseDot 1.1s ease-in-out infinite" : "none" }} />
              {i < steps.length - 1 && <div style={{ width: "2px", height: "20px", borderRadius: "1px", margin: "2px auto 0", background: isC ? "rgba(6,214,160,0.35)" : "#1e3a5f", transition: "background 0.4s" }} />}
            </div>
            <div style={{ flex: 1, paddingBottom: "2px" }}>
              <div style={{ fontSize: "12px", fontWeight: isA ? 600 : 500, color: isC ? "#c8d9ea" : isA ? "#0ea5e9" : "#4a7fa5", fontFamily: "'Space Grotesk',sans-serif", lineHeight: "1.35", transition: "color 0.3s" }}>
                {isC ? "✓ " : isA ? "⟳ " : ""}{s.label}
              </div>
              <div style={{ fontSize: "10px", fontFamily: "'JetBrains Mono',monospace", color: isA ? "rgba(14,165,233,0.55)" : "#2a4a6a", lineHeight: "1.4", marginTop: "2px", transition: "color 0.3s" }}>
                {s.detail}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AgentCard({ id, status, traces, isExpanded, onToggle }: {
  id: AgentId; status: AgentStatus;
  traces: Array<{ fn: string; result: string; msLabel: string }>;
  isExpanded: boolean; onToggle: () => void;
}) {
  const def = AGENT_DEFS[id];
  const r = hexToRgb(def.color);
  const isActive = status === "active", isComplete = status === "complete";
  const statusLabels: Record<AgentStatus, string> = { idle: "IDLE", active: "ACTIVE", complete: "DONE", error: "ERR" };

  return (
    <div onClick={onToggle} style={{ background: isActive ? `rgba(${r},0.06)` : "#0d1628", border: `1px solid ${isActive ? def.color : isComplete ? "rgba(6,214,160,0.22)" : "#1e3a5f"}`, borderRadius: "8px", padding: "10px 12px", marginBottom: "6px", cursor: "pointer", transition: "all 0.3s", boxShadow: isActive ? `0 0 20px rgba(${r},0.15)` : "none", animation: isActive ? "glowPulse 2s ease-in-out infinite" : "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ width: "7px", height: "7px", borderRadius: "50%", flexShrink: 0, background: status === "active" ? def.color : status === "complete" ? "#06d6a0" : status === "error" ? "#ef4444" : "#2a4a6a", boxShadow: isActive ? `0 0 6px ${def.color}` : "none", animation: isActive ? "pulseDot 1.4s ease-in-out infinite" : "none", transition: "background 0.3s" }} />
        <div style={{ width: "27px", height: "27px", borderRadius: "6px", flexShrink: 0, background: `rgba(${r},${isActive ? "0.18" : "0.07"})`, border: `1px solid rgba(${r},${isActive ? "0.5" : "0.18"})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", fontWeight: 700, color: isActive ? def.color : `rgba(${r},0.55)`, fontFamily: "'JetBrains Mono',monospace", transition: "all 0.3s" }}>
          {def.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "500 12px 'Space Grotesk'", color: "#e2e8f0", lineHeight: "1.3" }}>{def.name}</div>
          <div style={{ font: "400 10px 'Space Grotesk'", color: "#4a7fa5", marginTop: "1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{def.desc}</div>
        </div>
        <div style={{ fontSize: "8px", letterSpacing: "0.1em", padding: "2px 6px", borderRadius: "3px", background: isActive ? `rgba(${r},0.14)` : isComplete ? "rgba(6,214,160,0.08)" : "rgba(42,74,106,0.15)", color: isActive ? def.color : isComplete ? "#06d6a0" : "#2a4a6a", border: `1px solid ${isActive ? `rgba(${r},0.3)` : isComplete ? "rgba(6,214,160,0.15)" : "#1e3a5f"}`, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>
          {statusLabels[status]}
        </div>
        <div style={{ font: "400 10px 'Space Grotesk'", color: "#2a4a6a", flexShrink: 0, paddingLeft: "2px" }}>{isExpanded ? "▲" : "▼"}</div>
      </div>

      {isExpanded && (
        <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #1a2f4a" }}>
          {traces.length === 0 ? (
            <div style={{ font: "400 10px 'JetBrains Mono'", color: "#2a4a6a", padding: "2px 0" }}>No tool calls recorded yet</div>
          ) : traces.map((t, i) => (
            <div key={i} style={{ marginBottom: "8px", animation: "slideIn 0.2s ease" }}>
              <div style={{ font: "500 10px 'JetBrains Mono'", color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>▶ {t.fn}</div>
              <div style={{ font: "400 10px 'JetBrains Mono'", color: "#4a7fa5", paddingLeft: "12px", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.result}</div>
              <div style={{ font: "400 9px 'JetBrains Mono'", color: "#2a4a6a", paddingLeft: "12px", marginTop: "1px" }}>{t.msLabel}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function ChatWindow({ user, onLogout }: { user: AuthUser | null; onLogout: () => void }) {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [agentStatuses, setAgentStatuses] = useState<AgentStatuses>(INITIAL_STATUSES);
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([]);
  const [agentTraces, setAgentTraces] = useState<AgentTraces>(INITIAL_TRACES);
  const [expandedAgents, setExpandedAgents] = useState<Set<AgentId>>(new Set());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const messagesRef = useRef<HTMLDivElement>(null);
  const processingRef = useRef(false);

  // Create a backend session on mount
  useEffect(() => {
    createSession()
      .then(setSessionId)
      .catch(() => setApiError("Could not connect to support service. Is the Azure Functions host running?"));
  }, []);

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages, isProcessing]);

  const resetPanel = useCallback(() => {
    setAgentStatuses(INITIAL_STATUSES);
    setAgentTraces(INITIAL_TRACES);
    setPipelineSteps([]);
    setExpandedAgents(new Set());
  }, []);

  const resetChat = useCallback(() => {
    if (processingRef.current) return;
    setMessages([WELCOME_MESSAGE]);
    setInputValue("");
    setApiError(null);
    resetPanel();
    createSession().then(setSessionId).catch(() => {});
  }, [resetPanel]);

  const process = useCallback(async (userMessage: string) => {
    if (!sessionId || processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);
    setApiError(null);
    resetPanel();

    // Optimistic: router becomes active immediately
    setAgentStatuses((prev) => ({ ...prev, router: "active" }));
    setPipelineSteps(PENDING_PIPELINE);
    setExpandedAgents(new Set<AgentId>(["router"]));

    // Show a placeholder router trace while waiting
    await wait(600);
    setAgentTraces((prev) => ({
      ...prev,
      router: [{ fn: "Router.analyze_intent(message, session_ctx)", result: "classifying intent…", msLabel: "…" }],
    }));

    try {
      const res = await sendMessage(sessionId, userMessage);
      const agentId = res.agentId as AgentId;

      // Router done — replace placeholder with real trace
      setAgentStatuses((prev) => ({ ...prev, router: "complete" }));
      setAgentTraces((prev) => ({
        ...prev,
        router: (res.agentTraces["router"] ?? []).map((t) => ({
          fn: t.fn, result: t.result, msLabel: `${t.ms}ms`,
        })),
      }));
      await wait(400);

      // Sub-agent becomes active
      setAgentStatuses((prev) => ({ ...prev, [agentId]: "active" }));
      setExpandedAgents((prev) => new Set([...prev, agentId]));

      // Replay real tool-call traces one by one for visual effect
      const subTraces = res.agentTraces[agentId] ?? [];
      for (const t of subTraces) {
        await wait(340);
        setAgentTraces((prev) => ({
          ...prev,
          [agentId]: [...(prev[agentId] ?? []), { fn: t.fn, result: t.result, msLabel: `${t.ms}ms` }],
        }));
      }
      await wait(400);

      // Finalise
      setAgentStatuses((prev) => ({ ...prev, [agentId]: "complete" }));
      setPipelineSteps(
        res.pipelineSteps.map((s) => ({ ...s, status: "complete" as const }))
      );
      setMessages((prev) => [
        ...prev,
        { id: Date.now(), role: "assistant", text: res.answer, agentId },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setApiError(msg);
      setAgentStatuses(INITIAL_STATUSES);
      setPipelineSteps([]);
    }

    setIsProcessing(false);
    processingRef.current = false;
  }, [sessionId, resetPanel]);

  const send = useCallback((text?: string) => {
    const msg = (text ?? inputValue).trim();
    if (!msg || processingRef.current || !sessionId) return;
    setMessages((prev) => [...prev, { id: Date.now(), role: "user", text: msg }]);
    setInputValue("");
    setTimeout(() => process(msg), 120);
  }, [inputValue, process, sessionId]);

  const toggleAgent = useCallback((id: AgentId) => {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const showQP = messages.length <= 1 && !isProcessing;
  const displaySessionId = sessionId ? formatSessionId(sessionId) : "CONNECTING…";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#070b14", color: "#e2e8f0", fontFamily: "'Space Grotesk',sans-serif", overflow: "hidden" }}>

      {/* ── HEADER ── */}
      <div style={{ display: "flex", alignItems: "center", padding: "0 20px", height: "52px", background: "#0d1628", borderBottom: "1px solid #1e3a5f", flexShrink: 0, gap: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          <div style={{ width: "30px", height: "30px", background: "linear-gradient(135deg,#0ea5e9,#6366f1)", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <circle cx="7.5" cy="7.5" r="2" fill="white" />
              <circle cx="2" cy="4" r="1.5" fill="white" opacity="0.65" /><circle cx="13" cy="4" r="1.5" fill="white" opacity="0.65" />
              <circle cx="2" cy="11" r="1.5" fill="white" opacity="0.65" /><circle cx="13" cy="11" r="1.5" fill="white" opacity="0.65" />
              <line x1="7.5" y1="7.5" x2="2" y2="4" stroke="white" strokeWidth="0.8" opacity="0.45" />
              <line x1="7.5" y1="7.5" x2="13" y2="4" stroke="white" strokeWidth="0.8" opacity="0.45" />
              <line x1="7.5" y1="7.5" x2="2" y2="11" stroke="white" strokeWidth="0.8" opacity="0.45" />
              <line x1="7.5" y1="7.5" x2="13" y2="11" stroke="white" strokeWidth="0.8" opacity="0.45" />
            </svg>
          </div>
          <div>
            <div style={{ font: "600 13px/1 'Space Grotesk'", color: "#e2e8f0" }}>Multi-Agent Support</div>
            <div style={{ font: "400 10px/1 'JetBrains Mono'", color: "#4a7fa5", marginTop: "3px" }}>Azure OpenAI · Semantic Kernel · Cosmos DB</div>
          </div>
        </div>

        <div style={{ width: "1px", height: "20px", background: "#1e3a5f", flexShrink: 0 }} />

        {/* Status pill */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "3px 10px", borderRadius: "20px", background: isProcessing ? "rgba(14,165,233,0.1)" : !sessionId ? "rgba(239,68,68,0.07)" : "rgba(6,214,160,0.07)", border: `1px solid ${isProcessing ? "rgba(14,165,233,0.3)" : !sessionId ? "rgba(239,68,68,0.2)" : "rgba(6,214,160,0.2)"}`, fontSize: "10px", fontFamily: "'JetBrains Mono',monospace", color: isProcessing ? "#0ea5e9" : !sessionId ? "#ef4444" : "#06d6a0", letterSpacing: "0.06em" }}>
          <div style={{ width: "5px", height: "5px", borderRadius: "50%", flexShrink: 0, background: isProcessing ? "#0ea5e9" : !sessionId ? "#ef4444" : "#06d6a0", animation: isProcessing ? "pulseDot 1s ease-in-out infinite" : "none" }} />
          {isProcessing ? "PROCESSING" : !sessionId ? "OFFLINE" : "OPERATIONAL"}
        </div>

        <div style={{ flex: 1 }} />

        {/* New Chat */}
        <button
          onClick={resetChat}
          disabled={isProcessing}
          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "5px 12px", borderRadius: "6px", background: "transparent", border: "1px solid #1e3a5f", color: "#4a7fa5", font: "500 11px 'Space Grotesk'", cursor: isProcessing ? "not-allowed" : "pointer", transition: "all 0.2s", opacity: isProcessing ? 0.4 : 1, flexShrink: 0 }}
          onMouseEnter={(e) => { if (!isProcessing) { e.currentTarget.style.borderColor = "#0ea5e9"; e.currentTarget.style.color = "#e2e8f0"; e.currentTarget.style.background = "rgba(14,165,233,0.08)"; } }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e3a5f"; e.currentTarget.style.color = "#4a7fa5"; e.currentTarget.style.background = "transparent"; }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          New Chat
        </button>

        {/* Stats */}
        <div style={{ display: "flex", gap: "18px", alignItems: "center" }}>
          <div style={{ font: "400 10px 'JetBrains Mono'", color: "#4a7fa5" }}>SESSION <span style={{ color: "#7ca4c4" }}>{displaySessionId}</span></div>
          <div style={{ font: "400 10px 'JetBrains Mono'", color: "#4a7fa5" }}>MSGS <span style={{ color: "#7ca4c4" }}>{messages.length}</span></div>
          <div style={{ width: "1px", height: "18px", background: "#1e3a5f" }} />
          <div style={{ font: "400 10px 'JetBrains Mono'", color: "#4a7fa5", letterSpacing: "0.04em" }}>7 AGENTS READY</div>
        </div>

        <div style={{ width: "1px", height: "20px", background: "#1e3a5f", flexShrink: 0 }} />

        {/* User + logout */}
        {user && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
            <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "linear-gradient(135deg,#0ea5e9,#6366f1)", display: "flex", alignItems: "center", justifyContent: "center", font: "600 11px 'Space Grotesk'", color: "#fff", flexShrink: 0 }}>
              {(user.name || user.email).charAt(0).toUpperCase()}
            </div>
            <div style={{ font: "400 11px 'Space Grotesk'", color: "#7ca4c4", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user.name || user.email}
            </div>
            <button
              onClick={onLogout}
              title="Sign out"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "26px", height: "26px", borderRadius: "6px", background: "transparent", border: "1px solid #1e3a5f", color: "#4a7fa5", cursor: "pointer", transition: "all 0.2s", flexShrink: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#ef4444"; e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "rgba(239,68,68,0.07)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e3a5f"; e.currentTarget.style.color = "#4a7fa5"; e.currentTarget.style.background = "transparent"; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* ── MAIN BODY ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── LEFT: CHAT ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: "1px solid #1e3a5f", minWidth: 0, overflow: "hidden" }}>
          <div ref={messagesRef} style={{ flex: 1, overflowY: "auto", padding: "20px 20px 6px", display: "flex", flexDirection: "column" }}>
            {messages.map((msg) => {
              const isUser = msg.role === "user";
              const agentDef = msg.agentId ? AGENT_DEFS[msg.agentId] : null;
              return (
                <div key={msg.id} style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: "12px", animation: "msgIn 0.25s ease" }}>
                  <div style={{ maxWidth: "84%" }}>
                    <div style={{ padding: "12px 16px", borderRadius: isUser ? "16px 16px 4px 16px" : "4px 16px 16px 16px", background: isUser ? "linear-gradient(135deg,#0ea5e9,#0284c7)" : "#111f38", border: isUser ? "none" : "1px solid #1e3a5f", fontSize: "14px", lineHeight: "1.65", color: "#e2e8f0", fontFamily: "'Space Grotesk',sans-serif" }}>
                      <FormattedText text={msg.text} />
                    </div>
                    {agentDef && (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "5px", color: agentDef.color, letterSpacing: "0.08em" }}>
                        <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: agentDef.color, flexShrink: 0 }} />
                        <span style={{ font: "400 9px 'JetBrains Mono'" }}>via {agentDef.name.toUpperCase()}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {isProcessing && <TypingIndicator />}
            {apiError && (
              <div style={{ margin: "8px 0 12px", padding: "10px 14px", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "8px", font: "400 12px 'Space Grotesk'", color: "#f87171" }}>
                {apiError}
              </div>
            )}
          </div>

          {/* Quick prompts */}
          {showQP && (
            <div style={{ padding: "4px 20px 14px" }}>
              <div style={{ font: "500 10px 'JetBrains Mono'", color: "#4a7fa5", letterSpacing: "0.08em", marginBottom: "10px" }}>TRY ASKING</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {QUICK_PROMPTS.map((qp) => (
                  <button key={qp} onClick={() => send(qp)} disabled={!sessionId}
                    style={{ background: "#0d1628", border: "1px solid #1e3a5f", borderRadius: "20px", padding: "7px 14px", font: "400 12px 'Space Grotesk'", color: "#7ca4c4", cursor: sessionId ? "pointer" : "not-allowed", transition: "all 0.2s", opacity: sessionId ? 1 : 0.5 }}
                    onMouseEnter={(e) => { if (sessionId) { e.currentTarget.style.borderColor = "#0ea5e9"; e.currentTarget.style.color = "#e2e8f0"; e.currentTarget.style.background = "#111f38"; } }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e3a5f"; e.currentTarget.style.color = "#7ca4c4"; e.currentTarget.style.background = "#0d1628"; }}
                  >{qp}</button>
                ))}
              </div>
            </div>
          )}

          {/* Input bar */}
          <div style={{ padding: "14px 20px", borderTop: "1px solid #1e3a5f", background: "#0d1628", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: "10px", alignItems: "flex-end" }}>
              <textarea value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Describe your issue…" rows={2} disabled={!sessionId || isProcessing}
                style={{ flex: 1, background: "#111f38", border: "1px solid #1e3a5f", borderRadius: "10px", padding: "10px 14px", fontSize: "13px", lineHeight: "1.55", color: "#e2e8f0", opacity: !sessionId ? 0.5 : 1 }} />
              <button onClick={() => send()} disabled={!inputValue.trim() || !sessionId || isProcessing}
                style={{ width: "42px", height: "42px", borderRadius: "10px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", cursor: inputValue.trim() && sessionId && !isProcessing ? "pointer" : "not-allowed", background: inputValue.trim() && sessionId && !isProcessing ? "#0ea5e9" : "#0d1628", border: `1px solid ${inputValue.trim() && sessionId && !isProcessing ? "#0ea5e9" : "#1e3a5f"}`, color: inputValue.trim() && sessionId && !isProcessing ? "#fff" : "#2a4a6a" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
              </button>
            </div>
            <div style={{ font: "400 10px 'JetBrains Mono'", color: "#2a4a6a", marginTop: "8px" }}>Enter to send · Shift+Enter for newline</div>
          </div>
        </div>

        {/* ── RIGHT: AGENT ACTIVITY ── */}
        <div style={{ width: "430px", flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden", background: "#070b14" }}>
          <div style={{ padding: "10px 16px 9px", borderBottom: "1px solid #1e3a5f", flexShrink: 0, display: "flex", alignItems: "center" }}>
            <div style={{ font: "600 10px 'JetBrains Mono'", color: "#4a7fa5", letterSpacing: "0.1em" }}>AGENT ACTIVITY</div>
            <div style={{ flex: 1 }} />
            <div style={{ font: "400 10px 'JetBrains Mono'", color: "#2a4a6a" }}>↓ click agent to expand trace</div>
          </div>

          <div style={{ padding: "12px 16px 14px", borderBottom: "1px solid #1e3a5f", flexShrink: 0 }}>
            <div style={{ font: "500 10px 'JetBrains Mono'", color: "#4a7fa5", letterSpacing: "0.08em", marginBottom: "10px" }}>PIPELINE TRACE</div>
            <PipelineTrace steps={pipelineSteps} />
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px 16px" }}>
            <div style={{ font: "500 10px 'JetBrains Mono'", color: "#4a7fa5", letterSpacing: "0.08em", marginBottom: "8px", padding: "0 4px" }}>AGENTS · 7 REGISTERED</div>
            {AGENT_ORDER.map((id) => (
              <AgentCard key={id} id={id} status={agentStatuses[id]} traces={agentTraces[id]} isExpanded={expandedAgents.has(id)} onToggle={() => toggleAgent(id)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
