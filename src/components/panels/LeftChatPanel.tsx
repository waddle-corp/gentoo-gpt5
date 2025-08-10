"use client";

import { useChat, type Message } from "@ai-sdk/react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, User, Bot } from "lucide-react";

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

export default function LeftChatPanel() {
  const [input, setInput] = useState("");
  const [actionable, setActionable] = useState(false);
  const [hypotheses, setHypotheses] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [evaluating, setEvaluating] = useState(false);
  const [detecting, setDetecting] = useState(false);

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
        const withAssistant = [...messages, assistantMessage];
        const compact = withAssistant.slice(-20).map((m) => ({ role: m.role, content: partsToText(m) }));

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
      } catch {
        setActionable(false);
        setHypotheses([]);
        setSelected({});
      } finally {
        setDetecting(false);
      }
    },
  });

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
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Owner ↔ LLM Chat</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4 min-h-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto pr-4">
          <div className="space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 py-8">상품이나 마케팅에 대한 질문을 해보세요</div>
            )}
            {messages.map((message) => (
              <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`flex gap-3 max-w-[80%] ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${message.role === "user" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>
                    {message.role === "user" ? <User size={16} /> : <Bot size={16} />}
                  </div>
                  <div className={`px-4 py-2 rounded-lg ${message.role === "user" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900"}`}>
                    <div className="whitespace-pre-wrap">
                      {message.parts
                        .map((part) => {
                          if (part.type === "text") return part.text;
                          return "";
                        })
                        .join("")}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* 가설 체크박스 + 실행 버튼 (마지막 메시지 아래) */}
            {(detecting || (actionable && !isLoading)) && (
              <div className="mt-2 space-y-2">
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
                <div className="flex gap-3 max-w-[80%]">
                  <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center">
                    <Bot size={16} />
                  </div>
                  <div className="px-4 py-2 rounded-lg bg-gray-100 text-gray-900">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="질문을 입력하세요..." disabled={isLoading} className="flex-1" />
          <Button type="submit" disabled={isLoading || !input.trim()}>
            <Send size={16} />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
