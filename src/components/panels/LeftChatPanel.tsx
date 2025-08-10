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
    <div className="break-words leading-[1.6]">
      <MD
        remarkPlugins={[remarkGfm]}
        components={{
          ol: (props: any) => <ol className="list-decimal pl-5 space-y-1" {...props} />,
          ul: (props: any) => <ul className="list-disc pl-5 space-y-1" {...props} />,
          li: (props: any) => <li className="my-0 leading-[1.6]" {...props} />, 
          p: (props: any) => <p className="leading-[1.6] mb-2 last:mb-0" {...props} />,
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
  const lastDetectAtRef = useRef<number>(0);
  const lastAssistantSigRef = useRef<string>("");
  const MIN_DETECT_INTERVAL_MS = 1800;

  // (moved below useChat) auto-scroll helpers declared after hooks that provide dependencies

  const { messages, append, status } = useChat({
    api: "/api/chat",
    streamProtocol: "text",
    onFinish: async (assistantMessage) => {
      try {
        setDetecting(true);
        const partsToText = (m: any) =>
          Array.isArray(m?.parts)
            ? m.parts
                .map((p: any) => (p?.type === "text" ? String(p.text || "") : ""))
                .join("")
            : String(m?.content || "");

        const lastAssistantText = partsToText(assistantMessage);
        // 호출 과다 방지 가드: 진행 중/쿨다운/중복 콘텐츠 차단
        if (detecting) return; // 이미 진행 중이면 스킵
        const now = Date.now();
        if (now - (lastDetectAtRef.current || 0) < MIN_DETECT_INTERVAL_MS) return;
        const sig = simpleSig(lastAssistantText);
        if (sig === lastAssistantSigRef.current) return;

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
          if (res.ok && data?.ok) {
            detected.actionable = Boolean(data.actionable);
            detected.hypotheses = Array.isArray(data.hypotheses) ? data.hypotheses : [];
          }
        } catch {}

        if (!detected.actionable || detected.hypotheses.length === 0) {
          const kw = ["시뮬", "실험", "가설", "테스트", "해보시겠", "evaluate", "전체 평가"];
          const hit = kw.some((k) => lastAssistantText.includes(k));
          if (hit) {
            detected.actionable = true;
            detected.hypotheses = [lastAssistantText];
          }
        }

        const normalized = splitHypotheses(detected.hypotheses);
        if (detected.actionable && normalized.length > 0) {
          setActionable(true);
          setHypotheses(normalized);
          setSelected({});
        } else {
          setActionable(false);
          setHypotheses([]);
          setSelected({});
        }
        // 쿨다운/중복 시그니처 갱신
        lastDetectAtRef.current = now;
        lastAssistantSigRef.current = sig;
      } catch {
        setActionable(false);
        setHypotheses([]);
        setSelected({});
      } finally {
        setDetecting(false);
      }
    },
  });

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
    append({ role: "user", content: input });
    setInput("");
  };

  const isLoading = status === "streaming";

  async function runEvaluateAll() {
    const picked = hypotheses.map((h, i) => ({ h, i })).filter(({ i }) => selected[i]);
    if (picked.length === 0) return;
    try {
      setEvaluating(true);
      const responses = await Promise.all(
        picked.map(async (p) => {
          const res = await fetch("/api/eval-sentiment", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ question: p.h }),
          });
          const data = await res.json();
          if (res.ok && data?.ok && Array.isArray(data.results)) return data.results as string[];
          return [] as string[];
        })
      );
      window.dispatchEvent(
        new CustomEvent("eval-results", {
          detail: { resultsList: responses, titles: picked.map((p) => titleOf(p.h)) },
        })
      );
    } finally {
      setEvaluating(false);
    }
  }

  return (
    <Card className="h-full flex flex-col border-0 rounded-none bg-transparent" style={{ backgroundColor: "transparent" }}>
      {/* Title removed as requested */}
      <CardContent className="px-0 flex-1 flex flex-col gap-4 min-h-0">
        {/* Messages */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pr-0 chat-scrollbar">
          <div className="space-y-4 px-4">
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
                  </div>
                </div>
              </div>
            ))}

            {/* 가설 체크박스 + 실행 버튼 (마지막 메시지 아래) */}
            {(detecting || (actionable && !isLoading)) && (
              <div className="mt-2 space-y-2 px-4">
                {detecting ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                    <span>Thinking…</span>
                  </div>
                ) : (
                  <>
                    <div className="text-xs text-muted-foreground">Select hypotheses to simulate:</div>
                    <div className="flex flex-col gap-2">
                      {hypotheses.map((h, i) => (
                        <label key={i} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={!!selected[i]}
                            onChange={(e) => setSelected((prev) => ({ ...prev, [i]: e.target.checked }))}
                          />
                          <span className="truncate">{titleOf(h)}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" onClick={runEvaluateAll} disabled={evaluating}>
                        {evaluating ? "Running..." : "Run Simulation"}
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

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex px-4">
          <div className="relative w-full">
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
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg白 text-black hover:bg-white/90"
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
