"use client";

import { useChat } from "@ai-sdk/react";
import { useRef, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function MarkdownRenderer({ content }: { content: string }) {
  const MD = ReactMarkdown as unknown as React.ComponentType<any>;
  return (
    <div className="break-words leading-[1.75]">
      <MD
        remarkPlugins={[remarkGfm]}
        components={{
          ol: (props: any) => <ol className="my-0 list-decimal pl-5 space-y-2" {...props} />,
          ul: (props: any) => <ul className="my-0 list-disc pl-5 space-y-2" {...props} />,
          li: (props: any) => <li className="my-0 leading-[1.75]" {...props} />, 
          p: (props: any) => <p className="leading-[1.75] m-0" {...props} />,
        }}
      >
        {content}
      </MD>
    </div>
  );
}

function splitHypotheses(rawList: string[]): string[] {
  const joined = rawList.filter(Boolean).join("\n");
  const lines = joined
    .split(/\r?\n+/)
    .flatMap((l) => l.split(/\s?--\s?|\s?—\s?|\s?;\s?/))
    .map((s) => s.replace(/^\s*[•\-\*]\s*/, "").replace(/^\s*\d+[\.)]\s*/, "").trim())
    .filter((s) => s.length > 0);
  // dedupe, keep order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of lines) {
    const k = s.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  }
  return out; // 모든 가설을 반환
}

function titleOf(h: string): string {
  const cut = h.split(/[:\-\u2014]/)[0];
  const t = (cut || h).trim().replace(/^"|^'|^\[|^\(/, "").replace(/"$|'$|\]$|\)$/ , "");
  return t.length > 60 ? t.slice(0, 57) + "…" : t;
}

function simpleSig(text: string): string {
  const s = text || "";
  return `${s.length}|${s.slice(0, 64)}|${s.slice(-64)}`;
}

export default function LeftChatPanel() {
  const [input, setInput] = useState("");
  const [actionable, setActionable] = useState(false);
  const [hypotheses, setHypotheses] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [evaluating, setEvaluating] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [awaitingFirstToken, setAwaitingFirstToken] = useState(false);
  const lastDetectAtRef = useRef<number>(0);
  const lastAssistantSigRef = useRef<string>("");
  const MIN_DETECT_INTERVAL_MS = 1800;

  // Clear conversation via topbar
  useEffect(() => {
    function onClear() {
      try {
        // reset local UI state
        setActionable(false);
        setHypotheses([]);
        setSelected({});
        setInput("");
        // Clear message list by reloading the page area or triggering a soft reset.
        // useChat does not expose a clear() here, so we force rerender via location reload.
        if (typeof window !== "undefined") {
          window.location.reload();
        }
      } catch {}
    }
    window.addEventListener("clear-chat", onClear as EventListener);
    return () => window.removeEventListener("clear-chat", onClear as EventListener);
  }, []);

  // (moved below useChat) auto-scroll helpers declared after hooks that provide dependencies

  const { messages, append, status } = useChat({
    api: "/api/chat",
    streamProtocol: "text",
    onFinish: async (assistantMessage) => {
      try {
        const partsToText = (m: any) =>
          Array.isArray(m?.parts)
            ? m.parts
                .map((p: any) => (p?.type === "text" ? String(p.text || "") : ""))
                .join("")
            : String(m?.content || "");

        const lastAssistantText = partsToText(assistantMessage);
        
        console.log("[detect-actionable] Starting detection for message:", lastAssistantText);
        
        // Guards
        if (detecting) {
          console.log("[detect-actionable] Aborting: detection already in progress.");
          return;
        }
        const now = Date.now();
        if (now - (lastDetectAtRef.current || 0) < MIN_DETECT_INTERVAL_MS) {
          console.log("[detect-actionable] Aborting: called too recently.");
          return;
        }
        const sig = simpleSig(lastAssistantText);
        if (sig === lastAssistantSigRef.current) {
          console.log("[detect-actionable] Aborting: duplicate message content.");
          return;
        }

        setDetecting(true);

        const withAssistant = [...messages, assistantMessage];
        const compact = withAssistant.slice(-10).map((m) => ({ role: m.role, content: partsToText(m) }));

        let detected = { actionable: false, hypotheses: [] as string[] };
        try {
          const res = await fetch("/api/detect-actionable", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ messages: compact, lastAssistant: lastAssistantText }),
          });
          const data = await res.json();
          console.log("[detect-actionable] API Response:", data);
          if (res.ok && data?.ok) {
            detected.actionable = Boolean(data.actionable);
            detected.hypotheses = Array.isArray(data.hypotheses) ? data.hypotheses : [];
          }
        } catch (err) {
            console.error("[detect-actionable] API call failed:", err);
        }

        // GPT 재시도 (1회)
        if ((!detected.actionable || detected.hypotheses.length === 0) && lastAssistantText.length > 20) {
          console.log("[detect-actionable] First attempt failed or was empty, retrying...");
          try {
            const res2 = await fetch("/api/detect-actionable", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ messages: compact, lastAssistant: lastAssistantText }),
            });
            const data2 = await res2.json();
            console.log("[detect-actionable] Retry API Response:", data2);
            if (res2.ok && data2?.ok) {
              detected.actionable = Boolean(data2.actionable);
              detected.hypotheses = Array.isArray(data2.hypotheses) ? data2.hypotheses : [];
            }
          } catch (err) {
            console.error("[detect-actionable] Retry API call failed:", err);
          }
        }

        const normalized = splitHypotheses(detected.hypotheses);
        console.log("[detect-actionable] Detected:", detected, "Normalized:", normalized);

        if (detected.actionable && normalized.length > 0) {
          console.log("[detect-actionable] Setting actionable to TRUE with hypotheses.");
          setActionable(true);
          setHypotheses(normalized);
          setSelected({});
        } else {
          console.log("[detect-actionable] Setting actionable to FALSE.");
          setActionable(false);
          setHypotheses([]);
          setSelected({});
        }
        
        lastDetectAtRef.current = now;
        lastAssistantSigRef.current = sig;
      } catch (e) {
        console.error("[detect-actionable] Unhandled error in onFinish:", e);
        setActionable(false);
        setHypotheses([]);
        setSelected({});
      } finally {
        setDetecting(false);
      }
    },
  });

  // 첫 토큰 대기 상태 관리: 스트리밍 시작 시 true, 첫 어시스턴트 토큰 수신 시 false
  useEffect(() => {
    if (status !== "streaming") {
      setAwaitingFirstToken(false);
      return;
    }
    if (!messages || messages.length === 0) {
      setAwaitingFirstToken(true);
      return;
    }
    const last = messages[messages.length - 1];
    const partsToText = (m: any) =>
      Array.isArray(m?.parts)
        ? m.parts.map((p: any) => (p?.type === "text" ? String(p.text || "") : "")).join("")
        : String(m?.content || "");
    if (last?.role === "assistant") {
      const txt = partsToText(last);
      setAwaitingFirstToken(!(txt && txt.length > 0));
    } else {
      setAwaitingFirstToken(true);
    }
  }, [messages, status]);

  // Auto-scroll to bottom when messages update
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const el = scrollContainerRef.current;
    if (!el) return;
    try {
      el.scrollTo({ top: el.scrollHeight, behavior });
    } catch {
      el.scrollTop = el.scrollHeight;
    }
  };
  useEffect(() => {
    // On mount and whenever messages change, stick to bottom
    scrollToBottom(messages.length <= 2 ? "auto" : "smooth");
  }, [messages]);
  useEffect(() => {
    if (status === "streaming") scrollToBottom("smooth");
  }, [status]);

  // When detection UI appears (spinner or hypothesis list), keep view pinned to bottom
  useEffect(() => {
    if (detecting || (actionable && hypotheses.length > 0)) {
      scrollToBottom("smooth");
    }
  }, [detecting, actionable, hypotheses]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || status === "streaming") return;
    setActionable(false);
    setHypotheses([]);
    setSelected({});
    setAwaitingFirstToken(true);
    append({ role: "user", content: input });
    setInput("");
  };

  const isLoading = status === "streaming";

  async function runEvaluateAll() {
    const picked = hypotheses.map((h, i) => ({ h, i })).filter(({ i }) => selected[i]);
    if (picked.length === 0) return;
    try {
      setEvaluating(true);
      let finished = 0;
      picked.forEach(async (p) => {
        try {
          const title = titleOf(p.h);
          window.dispatchEvent(new CustomEvent("eval-start", { detail: { title } }));
          const res = await fetch("/api/eval-sentiment", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ question: p.h, stream: true }),
          });
          const reader = res.body?.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (reader) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let i;
            while ((i = buffer.indexOf("\n")) !== -1) {
              const line = buffer.slice(0, i).trim();
              buffer = buffer.slice(i + 1);
              if (!line) continue;
              try {
                const obj = JSON.parse(line);
                if (obj && typeof obj === "object") {
                  if (obj.idx !== undefined && obj.label) {
                    window.dispatchEvent(new CustomEvent("eval-chunk", { detail: { title, idx: Number(obj.idx), label: String(obj.label), reason: String(obj.reason || "") } }));
                  }
                  if (obj.type === "done") {
                    window.dispatchEvent(new CustomEvent("eval-done", { detail: { title } }));
                  }
                }
              } catch {}
            }
          }
        } catch {
          // ignore per-stream failure
        } finally {
          finished += 1;
          if (finished === picked.length) setEvaluating(false);
        }
      });
    } finally {
      // finished handled per stream
    }
  }

  return (
    <Card className="h-full flex flex-col border-0 rounded-none bg-transparent" style={{ backgroundColor: "transparent" }}>
      {/* Title removed as requested */}
      <CardContent className="px-0 flex-1 flex flex-col gap-4 min-h-0">
        {/* Messages */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pr-0 chat-scrollbar">
          <div className="space-y-4 px-4">
            <div className="mx-auto w-full max-w-[800px] space-y-4">
            {messages.length === 0 && null}
            {messages.map((message) => (
              <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`flex gap-3 ${message.role === "user" ? "max-w-[80%] flex-row-reverse" : "max-w-[92%] flex-row"}`}>
                  {/* avatar removed */}
                  <div
                    className={`px-4 py-2 rounded-lg text-sm ${message.role === "user" ? "text-white" : "bg-transparent text-white"}`}
                    style={message.role === "user" ? { backgroundColor: "#4D4D4D" } : undefined}
                  >
                    <MarkdownRenderer
                      content={message.parts
                        .map((part) => (part.type === "text" ? String(part.text || "") : ""))
                        .join("")}
                    />
                    {/* 스트리밍 시작 후 첫 토큰 나오기 전: 회전 이모지 표시 */}
                    {(() => {
                      const isLast = message.id === messages[messages.length - 1]?.id;
                      const isAssistant = message.role === "assistant";
                      if (isLast && isAssistant && status === "streaming" && awaitingFirstToken) {
                        return (
                          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="inline-block animate-spin size-4 rounded-full border-2 border-zinc-300 border-t-zinc-600" />
                            <span>Thinking…</span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              </div>
            ))}

            {/* 가설 체크박스 + 실행 버튼 (마지막 메시지 아래) */}
            {(detecting || (actionable && !isLoading)) && (
              <div className="mt-2 space-y-2">
                {detecting ? (
                  <div className="ml-4 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                    <span>Thinking…</span>
                  </div>
                ) : (
                  <>
                    <div className="ml-4 text-xs text-muted-foreground">Select hypotheses to simulate:</div>
                    <div className="ml-4 flex flex-col gap-2">
                      {hypotheses.map((h, i) => (
                        <label key={i} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="size-4 rounded accent-indigo-500 focus:ring-2 focus:ring-purple-400/50"
                            checked={!!selected[i]}
                            onChange={(e) => setSelected((prev) => ({ ...prev, [i]: e.target.checked }))}
                          />
                          <span className={`truncate ${selected[i] ? "text-purple-400" : "text-white"}`}>{titleOf(h)}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <Button
                        onClick={runEvaluateAll}
                        disabled={evaluating}
                        className="px-4 py-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
                      >
                        {evaluating ? (
                          <>
                            <span className="inline-block w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                            Running...
                          </>
                        ) : (
                          <>Run Simulation</>
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="flex gap-3 max-w-[92%]">
                  <div className="px-4 py-2 rounded-lg bg-transparent text-white text-sm">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: ".1s" }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: ".2s" }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex px-4">
          <div className="relative w-full max-w-[800px] mx-auto">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything"
              disabled={isLoading}
              className="w-full pr-10 h-12 rounded-full"
              style={{ backgroundColor: "var(--chat-input-bg)" }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  if (!isLoading && input.trim()) {
                    e.preventDefault();
                    handleSubmit(e as any);
                  }
                }
              }}
            />
            <Button
              type="submit"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white text-black hover:bg-white/90"
              disabled={isLoading || !input.trim()}
              aria-label="Send message"
            >
              <ArrowUp size={14} />
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
