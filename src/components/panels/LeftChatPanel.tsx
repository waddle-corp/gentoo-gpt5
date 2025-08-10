"use client";

import { useChat, type Message } from "@ai-sdk/react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, User, Bot } from "lucide-react";

type Props = { embedded?: boolean };

export default function LeftChatPanel({ embedded }: Props) {
  const [input, setInput] = useState("");
  
  const { messages, append, status, error } = useChat({
    api: "/api/chat",
    streamProtocol: "text",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || status === "streaming") return;

    append({ role: "user", content: input });
    setInput("");
  };

  const isLoading = status === "streaming";

  if (embedded) {
    return (
      <div className="h-full min-h-0 flex flex-col pb-0 bg-transparent overflow-hidden">
        {/* Title removed as requested */}
        <CardContent className="px-0 flex-1 flex flex-col gap-3 min-h-0 pb-4">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 min-h-0">
          <div className="space-y-4">
            {messages.length === 0 && null}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`flex gap-3 max-w-[80%] ${
                    message.role === "user" ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  {message.role !== "user" && (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-muted text-muted-foreground">
                      <Bot size={16} />
                    </div>
                  )}
                  <div
                    className={`px-4 py-2 rounded-lg ${
                      message.role === "user"
                        ? "bg-secondary text-secondary-foreground"
                        : "bg-card text-foreground"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">
                      {message.parts.map((part, index) => {
                        if (part.type === "text") {
                          return part.text;
                        }
                        return null;
                      }).join("")}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="flex gap-3 max-w-[80%]">
                  <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
                    <Bot size={16} />
                  </div>
                  <div className="px-4 py-2 rounded-lg bg-card text-foreground">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex">
          <div className="w-full px-4 md:px-6">
            <div className="relative">
              <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              rows={1}
                className="min-h-12 max-h-28 pr-12 border border-[#3d3d3d] text-sm leading-normal py-3"
                style={{ height: "auto", backgroundColor: "var(--chat-input-bg)" }}
              onInput={(e) => {
                const el = e.currentTarget as HTMLTextAreaElement;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 28 * 4) + "px"; // 4 lines max
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!isLoading && input.trim()) {
                    append({ role: "user", content: input });
                    setInput("");
                  }
                }
              }}
            />
            {input.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center px-3 pr-12 text-muted-foreground opacity-70 text-sm leading-none font-semibold">
                Ask anything
              </div>
            )}
            <Button
              type="submit"
              size="icon"
              className="absolute right-3 top-1/2 -translate-y-1/2 size-8 rounded-full z-10 bg-white text-black hover:bg-white/90"
              disabled={isLoading || !input.trim()}
              aria-label="Send message"
            >
              <ArrowUp size={16} />
            </Button>
            </div>
          </div>
        </form>
        </CardContent>
      </div>
    );
  }

  return (
    <Card className="h-full flex flex-col pb-4">
      {/* Title removed as requested */}
      <CardContent className="px-4 flex-1 flex flex-col gap-3 min-h-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`flex gap-3 max-w-[80%] ${
                    message.role === "user" ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  {message.role !== "user" && (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-muted text-muted-foreground">
                      <Bot size={16} />
                    </div>
                  )}
                  <div
                    className={`px-4 py-2 rounded-lg ${
                      message.role === "user"
                        ? "bg-secondary text-secondary-foreground"
                        : "bg-card text-foreground"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">
                      {message.parts
                        .map((part, index) => {
                          if (part.type === "text") {
                            return part.text;
                          }
                          return null;
                        })
                        .join("")}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="flex gap-3 max-w-[80%]">
                  <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
                    <Bot size={16} />
                  </div>
                  <div className="px-4 py-2 rounded-lg bg-card text-foreground">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex">
          <div className="w-full">
            <div className="relative">
              <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              rows={1}
                className="min-h-12 max-h-28 pr-12 border border-[#3d3d3d] text-sm leading-normal py-3"
                style={{ height: "auto", backgroundColor: "var(--chat-input-bg)" }}
              onInput={(e) => {
                const el = e.currentTarget as HTMLTextAreaElement;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 28 * 4) + "px"; // 4 lines max
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!isLoading && input.trim()) {
                    append({ role: "user", content: input });
                    setInput("");
                  }
                }
              }}
            />
            {input.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center px-3 pr-12 text-muted-foreground opacity-70 text-sm leading-none">
                Ask anything
              </div>
            )}
            <Button
              type="submit"
              size="icon"
              className="absolute right-3 top-1/2 -translate-y-1/2 size-8 rounded-full z-10 bg-white text-black hover:bg-white/90"
              disabled={isLoading || !input.trim()}
              aria-label="Send message"
            >
              <ArrowUp size={16} />
            </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
