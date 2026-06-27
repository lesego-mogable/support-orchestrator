const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:7071/api";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  agent?: string;
}

export interface ChatResponse {
  answer: string;
  agent: string;
  intentReason: string;
  sessionId: string;
}

export async function createSession(): Promise<string> {
  const res = await fetch(`${API_BASE}/sessions`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to create session");
  const data = await res.json();
  return data.sessionId as string;
}

export async function sendMessage(
  sessionId: string,
  message: string
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
}
