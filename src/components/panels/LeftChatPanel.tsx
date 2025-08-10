"use client";

import { useChat } from "@ai-sdk/react";
import { useRef, useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of lines) {
    const k = s.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  }
  return out;
}

function titleOf(h: string): string {
  const cut = h.split(/[:\-\u2014]/)[0];
  const t = (cut || h).trim().replace(/^"|^'|^\[|^\(/, "").replace(/"$|'$|\]$|\)$/, "");
  return t.length > 60 ? t.slice(0, 57) + "…" : t;
}

function simpleSig(text: string): string {
  const s = text || "";
  return `${s.length}|${s.slice(0, 64)}|${s.slice(-64)}`;
}

const EXAMPLE_PROMPTS: string[] = [
  "How can I sell inventory for products other than my bestsellers?",
  "If I want to boost sales for a specific product, what should I do?",
  "What kind of promotional event should we run this fall? to increase total revenue?",
];

export default function LeftChatPanel() {
  const [input, setInput] = useState("");
  const [actionable, setActionable] = useState(false);
  const [hypotheses, setHypotheses] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [evaluating, setEvaluating] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [loadingStage, setLoadingStage] = useState<"" | "thinking" | "fetching">("");
  const lastDetectAtRef = useRef<number>(0);
  const lastAssistantSigRef = useRef<string>("");
  const MIN_DETECT_INTERVAL_MS = 1800;

  useEffect(() => {
    function onClear() {
      try {
        setActionable(false);
        setHypotheses([]);
        setSelected({});
        setInput("");
        if (typeof window !== "undefined") {
          window.location.reload();
        }
      } catch {}
    }
    window.addEventListener("clear-chat", onClear as EventListener);
    return () => window.removeEventListener("clear-chat", onClear as EventListener);
  }, []);

  const { messages, append, status } = useChat({
    api: "/api/chat",
    streamProtocol: "text",
    onFinish: async (assistantMessage) => {
      try {
        const partsToText = (m: any) =>
          Array.isArray(m?.parts)
            ? m.parts.map((p: any) => (p?.type === "text" ? String(p.text || "") : "")).join("")
            : String(m?.content || "");

        const lastAssistantText = partsToText(assistantMessage);
        console.log("[detect-actionable] Starting detection for message:", lastAssistantText);

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

  const isLoading = status === 'streaming';

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
    scrollToBottom(messages.length <= 2 ? "auto" : "smooth");
  }, [messages, loadingStage]);

  useEffect(() => {
    if (status === "streaming") scrollToBottom("smooth");
  }, [status]);
  
  useEffect(() => {
    if (detecting || (actionable && hypotheses.length > 0)) {
      scrollToBottom("smooth");
    }
  }, [detecting, actionable, hypotheses]);

  const sendPrompt = (text: string) => {
    const trimmed = (text || "").trim();
    if (!trimmed || isLoading || loadingStage) return;

    // Open right panel immediately (before assistant starts speaking)
    try {
      localStorage.setItem("pre-sim-open", "1");
    } catch {}
    window.dispatchEvent(new CustomEvent("pre-simulation-start"));

    setLoadingStage("thinking");
    setTimeout(() => {
      setLoadingStage("fetching");
      setTimeout(() => {
        setLoadingStage("");
        try {
          localStorage.setItem("pre-sim-open", "1");
        } catch {}
        window.dispatchEvent(new CustomEvent("pre-simulation-start")); // Show engagement panel (redundant but safe)
      }, 2500); // Stage 2: 2.5 seconds
    }, 2500); // Stage 1: 2.5 seconds

    setActionable(false);
    setHypotheses([]);
    setSelected({});
    append({ role: "user", content: trimmed });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendPrompt(input);
    setInput("");
  };

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
        } finally {
          finished += 1;
          if (finished === picked.length) setEvaluating(false);
        }
      });
    } finally {
    }
  }

  return (
    <Card className="h-full flex flex-col border-0 rounded-none bg-transparent" style={{ backgroundColor: "transparent" }}>
      <CardContent className="px-0 flex-1 flex flex-col gap-4 min-h-0">
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pr-0 chat-scrollbar">
          <div className="space-y-4 px-4">
            <div className="mx-auto w-full max-w-[800px] space-y-4">
            {messages.map((message) => (
              <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`flex gap-3 ${message.role === "user" ? "max-w-[80%] flex-row-reverse" : "max-w-[92%] flex-row"}`}>
                  <div
                    className={`px-4 py-2 rounded-lg text-sm ${message.role === "user" ? "text-white" : "bg-transparent text-white"}`}
                    style={message.role === "user" ? { backgroundColor: "#4D4D4D" } : undefined}
                  >
                    <MarkdownRenderer
                      content={message.parts.map((part) => (part.type === "text" ? String(part.text || "") : "")).join("")}
                    />
                  </div>
                </div>
              </div>
            ))}

            {loadingStage && (
              <div className="flex gap-3 justify-start">
                <div className="flex gap-3 max-w-[92%]">
                  <div className="px-4 py-2 rounded-lg bg-transparent text-white text-sm">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-block animate-spin size-4 rounded-full border-2 border-zinc-300 border-t-zinc-600" />
                      <span>{loadingStage === 'thinking' ? 'Thinking…' : 'Fetching data…'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

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
            </div>
          </div>
        </div>

        {messages.length === 0 && (
          <div className="px-4">
            <div className="mx-auto w-full max-w-[800px]">
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((p, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    className="whitespace-normal h-auto py-2 max-w-[220px]"
                    onClick={() => sendPrompt(p)}
                    disabled={isLoading || !!loadingStage}
                    aria-label={`예시 질문 전송: ${p}`}
                  >
                    <span className="whitespace-normal text-left leading-snug">{p}</span>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex px-4">
          <div className="relative w-full max-w-[800px] mx-auto">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything"
              disabled={isLoading || !!loadingStage}
              className="w-full pr-10 h-12 rounded-full"
              style={{ backgroundColor: "var(--chat-input-bg)" }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  if (!isLoading && !loadingStage && input.trim()) {
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
              disabled={isLoading || !input.trim() || !!loadingStage}
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
