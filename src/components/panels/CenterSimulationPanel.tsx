"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useMemo, useState, useRef } from "react";
import { User as UserIcon, X as CloseIcon } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContentProps } from "@/components/ui/chart";
import Image from "next/image";
import { ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

type BubbleState = "unknown" | "positive" | "negative" | "pending";

type PromptMeta = { idx: number; user_id: string; engagement_score: number };

type Board = {
  name: string;
  bubbles: BubbleState[];
  reasons?: string[];
};

type CenterSimulationPanelProps = {
  started?: boolean;
};

export default function CenterSimulationPanel({ started }: CenterSimulationPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [promptsCount, setPromptsCount] = useState(0);
  const [promptsMeta, setPromptsMeta] = useState<PromptMeta[]>([]);
  const [boards, setBoards] = useState<Board[]>([{ name: "All", bubbles: [] }]);
  const boardsRef = useRef(boards);
  useEffect(() => {
    boardsRef.current = boards;
  }, [boards]);
  const [active, setActive] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalData, setModalData] = useState<{ user_id: string; summary?: string; prompt?: string; engagement_score?: number } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profile, setProfile] = useState<{
    event_counts: Record<string, number>;
    reviews_count: number;
    review_titles: string[];
    reviews_detail?: Array<{ title: string; content: string; rating?: number }>;
    dialogues_total: number;
    dialogues_user_count: number;
    subscriptions_count?: number;
    add_to_cart_qty_total?: number;
    add_to_cart_value_total?: number;
    purchase_amounts?: number[];
    normalized_engagement_score?: number;
  } | null>(null);
  const [norms, setNorms] = useState<{
    max?: Record<string, number>;
    p95?: Record<string, number>;
  } | null>(null);

  const RADAR_MIN = 0.1;
  function buildRadarData(p: NonNullable<typeof profile>) {
    const c = p?.event_counts || {};
    const base = [
      { key: "product_view", subject: "product_view", raw: c["product_view"] || 0 },
      { key: "add_to_cart", subject: "add_to_cart", raw: c["add_to_cart"] || 0 },
      { key: "purchase_completed", subject: "purchase_completed", raw: c["purchase_completed"] || 0 },
      { key: "reviews", subject: "reviews", raw: p?.reviews_count || 0 },
      { key: "subscriptions", subject: "subscriptions", raw: p?.subscriptions_count || 0 },
      { key: "dialogues", subject: "dialogues", raw: p?.dialogues_total || 0 },
    ] as Array<{ key: string; subject: string; raw: number }>;
    // engagement-based scaling: normalize by global [0,1] then multiply by user's engagement factor (0..1)
    const denom = norms?.p95 || norms?.max || {};
    const engagementFactor = Math.min(1, Math.max(0, (p?.normalized_engagement_score ?? 0) / 30));
    return base.map((d) => {
      const dnm = Math.max(1, Number((denom as any)[d.key] ?? 1));
      const ratio = Math.min(1, d.raw / dnm) * engagementFactor;
      const A = ratio === 0 ? RADAR_MIN : Math.max(RADAR_MIN, ratio);
      return { subject: d.subject, raw: d.raw, A };
    });
  }

  function RadarTooltipContent({ active, payload }: ChartTooltipContentProps) {
    if (!active || !payload || payload.length === 0) return null;
    const p = payload[0];
    const subj = (p as any)?.payload?.subject;
    const raw = (p as any)?.payload?.raw;
    return (
      <div className="rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow">
        <div className="mb-1 text-[11px] font-medium text-muted-foreground">{String(subj)}</div>
        <div className="text-[12px]">value: {raw}</div>
      </div>
    );
  }

  async function loadPromptsMeta() {
    try {
      const res = await fetch("/api/simulate?prompts=1", { method: "GET" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const list: PromptMeta[] = Array.isArray(data.prompts) ? data.prompts : [];
      setPromptsMeta(list);
      setPromptsCount(list.length);
      setBoards([{ name: "All", bubbles: new Array(list.length).fill("unknown") }]);
      setActive(0);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  useEffect(() => {
    loadPromptsMeta();
  }, []);

  useEffect(() => {
    // Ensure sections appear as soon as simulation starts, even if main listeners haven't attached yet
    const onStartOnly = () => setHasStarted(true);
    window.addEventListener("eval-start", onStartOnly as EventListener);
    return () => window.removeEventListener("eval-start", onStartOnly as EventListener);
  }, []);

  useEffect(() => {
    function onEvalResults(e: any) {
      try {
        // 증분 이벤트: { result, reasons, title }
        const result: string[] = Array.isArray(e?.detail?.result) ? e.detail.result : [];
        const reasons: string[] = Array.isArray(e?.detail?.reasons) ? e.detail.reasons : [];
        const title: string = String(e?.detail?.title || "");
        if (!result.length) return;

        const mapped = result.map((v) => (v === "positive" ? "positive" : v === "negative" ? "negative" : "unknown")) as BubbleState[];
        const padded = mapped.length < promptsCount ? mapped.concat(new Array(promptsCount - mapped.length).fill("unknown")) : mapped.slice(0, promptsCount);
        const paddedReasons = (Array.isArray(reasons) ? reasons : []).length < promptsCount
          ? (reasons || []).concat(new Array(promptsCount - (reasons || []).length).fill(""))
          : reasons.slice(0, promptsCount);

        setBoards((prev) => {
          const next = [...prev];
          // All 보드가 없다면 초기화
          if (!next.length || next[0]?.name !== "All") {
            next[0] = { name: "All", bubbles: padded, reasons: paddedReasons } as Board;
          } else {
            // All 보드는 최신 결과로 업데이트 (가장 최근 결과 기준)
            next[0] = { ...next[0], bubbles: padded, reasons: paddedReasons };
          }
          // 동일 타이틀 보드가 있으면 업데이트, 없으면 추가
          const idx = next.findIndex((b) => b.name === title);
          if (idx >= 0) {
            next[idx] = { ...next[idx], bubbles: padded, reasons: paddedReasons };
          } else {
            next.push({ name: title, bubbles: padded, reasons: paddedReasons });
          }
          // De-duplicate after updates to prevent accidental duplicates from interleaved events
          const seen = new Set<string>();
          const dedup = [] as Board[];
          for (const b of next) {
            if (seen.has(b.name)) continue;
            seen.add(b.name);
            dedup.push(b);
          }
          return dedup;
        });

        setHasStarted(true);
        setHasSimulated(true);
        // 첫 결과 도착 시 활성 탭만 설정 (생성/로딩은 eval-done에서 한 번만 수행)
        setActive((cur) => (cur === 0 ? 1 : cur));
      } catch {}
    }

    function onEvalStart(e: any) {
      try {
        const title: string = String(e?.detail?.title || "");
        if (!title) return;
        setHasStarted(true);
        setBoards((prev) => {
          const next = [...prev];
          const idx = next.findIndex((b) => b.name === title);
          const pending = new Array(promptsCount).fill("pending") as BubbleState[];
          if (idx >= 0) {
            next[idx] = { ...next[idx], bubbles: pending, reasons: new Array(promptsCount).fill("") };
          } else {
            next.push({ name: title, bubbles: pending, reasons: new Array(promptsCount).fill("") });
          }
          if (!next.length || next[0]?.name !== "All") {
            next.unshift({ name: "All", bubbles: pending, reasons: new Array(promptsCount).fill("") });
          }
          // De-duplicate boards by name in case previous state already had an entry (safety)
          const seen = new Set<string>();
          const dedup = [] as Board[];
          for (const b of next) {
            if (seen.has(b.name)) continue;
            seen.add(b.name);
            dedup.push(b);
          }
          return dedup;
        });
        setActive((cur) => (cur === 0 ? 1 : cur));
      } catch {}
    }

    function onEvalChunk(e: any) {
      try {
        const title: string = String(e?.detail?.title || "");
        const idxNum: number = Number(e?.detail?.idx);
        const label: string = String(e?.detail?.label || "");
        const reason: string = String(e?.detail?.reason || "");
        if (!title || Number.isNaN(idxNum)) return;
        const mapped: BubbleState = label === "positive" ? "positive" : label === "negative" ? "negative" : "unknown";
        setBoards((prev) => {
          const next = [...prev];
          let bi = next.findIndex((b) => b.name === title);
          if (bi < 0) {
            // If board does not exist (e.g., component mounted after eval-start), create it now
            const initBubbles = new Array(Math.max(0, promptsCount)).fill("pending") as BubbleState[];
            const initReasons = new Array(Math.max(0, promptsCount)).fill("") as string[];
            next.push({ name: title, bubbles: initBubbles, reasons: initReasons });
            bi = next.length - 1;
          }
          // Update specific index
          const b = { ...next[bi] } as Board;
          const bubbles = [...(b.bubbles || [])];
          const reasons = [...(b.reasons || [])];
          if (idxNum >= 0 && idxNum < promptsCount) {
            bubbles[idxNum] = mapped;
            reasons[idxNum] = reason;
          }
          b.bubbles = bubbles;
          b.reasons = reasons as string[];
          next[bi] = b;
          // All 보드도 최신 반영
          if (next[0]?.name === "All") {
            const a = { ...next[0] } as Board;
            const ab = [...(a.bubbles || [])];
            const ar = [...(a.reasons || [])];
            if (idxNum >= 0 && idxNum < promptsCount) {
              ab[idxNum] = mapped;
              ar[idxNum] = reason;
            }
            a.bubbles = ab;
            a.reasons = ar as string[];
            next[0] = a;
          }
          return next;
        });
      } catch {}
    }

    function onEvalDone(e: any) {
      try {
        const title: string = String(e?.detail?.title || "");
        if (!title) return;
        setHasSimulated(true);

        // Use ref to get the latest state of boards to avoid stale closures
        const board = (boardsRef.current || []).find((b) => b.name === title);
        const bubbles = board?.bubbles || [];

        if (bubbles.length > 0) {
          // Chain the calls: load insights, and only on completion, load next actions.
          loadInsightsFor(bubbles, title).then(() => {
            loadNextFor(bubbles, title);
          });
        }
      } catch (err) {
        console.error("Error in onEvalDone:", err);
      }
    }

    window.addEventListener("eval-results", onEvalResults as EventListener);
    window.addEventListener("eval-start", onEvalStart as EventListener);
    window.addEventListener("eval-chunk", onEvalChunk as EventListener);
    window.addEventListener("eval-done", onEvalDone as EventListener);
    return () => {
      window.removeEventListener("eval-results", onEvalResults as EventListener);
      window.removeEventListener("eval-start", onEvalStart as EventListener);
      window.removeEventListener("eval-chunk", onEvalChunk as EventListener);
      window.removeEventListener("eval-done", onEvalDone as EventListener);
    };
  }, [promptsCount]);

  const groupedByScore = (b: BubbleState[]) => {
    const groups: number[][] = Array.from({ length: 30 }, () => []);
    for (const meta of promptsMeta) {
      const s = Math.max(1, Math.min(30, Number(meta.engagement_score) || 1));
      groups[s - 1].push(meta.idx);
    }
    return groups.map((indices) => indices.map((i) => i));
  };

  const renderBubble = (state: BubbleState, idx: number) => {
    const size = 12;
    const style: React.CSSProperties = { width: size, height: size, cursor: "pointer" };
    let cls = "border-2 rounded-full";
    if (state === "unknown") cls += " border-gray-500 bg-gray-400";
    else if (state === "pending") cls += " border-gray-300 bg-gray-200";
    else if (state === "positive") cls += " border-emerald-600 bg-emerald-500";
    else if (state === "negative") cls += " border-rose-500 bg-transparent";
    return <span key={`b-${idx}-${state}`} className={cls} style={style} onClick={() => openModalFor(idx)} />;
  };

  async function openModalFor(index: number) {
    try {
      setModalLoading(true);
      setModalOpen(true);
      setModalData(null);
      setProfile(null);
      setProfileLoading(true);
      setAvatarError(false);
      setLastIndexForModal(index);
      const res = await fetch(`/api/prompts?idx=${index}`);
      const data = await res.json();
      console.log('data', data);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setModalData({ user_id: data.user_id, summary: data.summary, prompt: data.prompt, engagement_score: data.engagement_score });
      // store last reason for this user index
      const r = boards[active]?.reasons?.[index] || "";
      setLastReason(r);

      // Load profile info in background
      const pRes = await fetch(`/api/user-profile?user_id=${encodeURIComponent(data.user_id)}`);
      const pData = await pRes.json();
      if (pRes.ok && pData?.ok) {
        setProfile({
          event_counts: pData.event_counts || {},
          reviews_count: Number(pData.reviews_count || 0),
          review_titles: Array.isArray(pData.review_titles) ? pData.review_titles : [],
          reviews_detail: Array.isArray(pData.reviews_detail) ? pData.reviews_detail : [],
          dialogues_total: Number(pData.dialogues_total || 0),
          dialogues_user_count: Number(pData.dialogues_user_count || 0),
          subscriptions_count: Number(pData.subscriptions_count || 0),
          add_to_cart_qty_total: Number(pData.add_to_cart_qty_total || 0),
          add_to_cart_value_total: Number(pData.add_to_cart_value_total || 0),
          purchase_amounts: Array.isArray(pData.purchase_amounts) ? pData.purchase_amounts : [],
          normalized_engagement_score: Number(pData.normalized_engagement_score || 0),
        });
      }
      // fetch global normalization metrics (best-effort)
      try {
        const nRes = await fetch(`/api/user-profile/metrics`);
        const nData = await nRes.json();
        if (nRes.ok && nData?.ok) setNorms({ max: nData.max, p95: nData.p95 });
      } catch {}
    } catch (e: any) {
      setModalData({ user_id: String(index), summary: `Failed to load summary: ${e?.message || String(e)}` });
    } finally {
      setModalLoading(false);
      setProfileLoading(false);
    }
  }

  const renderColumn = (score: number, indices: number[], bubbles: BubbleState[]) => {
    const maxPerSubCol = 10;
    const numSubCols = Math.max(1, Math.ceil(indices.length / maxPerSubCol));
    const subCols: number[][] = Array.from({ length: numSubCols }, (_, c) =>
      indices.slice(c * maxPerSubCol, (c + 1) * maxPerSubCol)
    );

    return (
      <div key={`col-${score}`} className="flex flex-col items-center gap-1">
        <div className="flex items-end gap-1">
          {subCols.map((col, ci) => (
            <div key={ci} className="flex flex-col gap-1 justify-end">
              {col.map((i) => renderBubble(bubbles[i] ?? "unknown", i))}
            </div>
          ))}
        </div>
        <div className="text-[10px] text-muted-foreground">{score}</div>
      </div>
    );
  };

  const activeBubbles = boards[active]?.bubbles || [];

  const legend = useMemo(() => {
    let p = 0, n = 0, u = 0;
    for (const s of activeBubbles) {
      if (s === "positive") p++; else if (s === "negative") n++; else u++;
    }
    return { p, n, u, total: activeBubbles.length };
  }, [activeBubbles]);

  function summarizeFor(bubbles: BubbleState[]) {
    const stats = { p: 0, n: 0, u: 0, total: bubbles.length } as any;
    for (const s of bubbles) {
      if (s === "positive") stats.p++; else if (s === "negative") stats.n++; else stats.u++;
    }
    const byScore: Array<{ score: number; positive: number; negative: number; unknown: number }> = [];
    const groups = groupedByScore(bubbles);
    for (let i = 0; i < groups.length; i++) {
      const indices = groups[i];
      let cp = 0, cn = 0, cu = 0;
      for (const idx of indices) {
        const s = bubbles[idx] ?? "unknown";
        if (s === "positive") cp++; else if (s === "negative") cn++; else cu++;
      }
      byScore.push({ score: i + 1, positive: cp, negative: cn, unknown: cu });
    }
    return { stats, byScore };
  }

  const [insights, setInsights] = useState("");
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [hasSimulated, setHasSimulated] = useState(false);
  const [hasStarted, setHasStarted] = useState(!!started);
  const [insightsCache, setInsightsCache] = useState<Record<string, string>>({});
  
  type NextActionItem = { type: 'ui' | 'chat' | 'startExampleText'; payload: string; content: string };
  const [nextActions, setNextActions] = useState<NextActionItem[]>([]);
  const [nextLoading, setNextLoading] = useState(false);
  const [selectedActions, setSelectedActions] = useState<Record<number, boolean>>({});
  const [deploying, setDeploying] = useState(false);
  const [nextCache, setNextCache] = useState<Record<string, NextActionItem[]>>({});
  const [lastReason, setLastReason] = useState<string>("");
  const [lastIndexForModal, setLastIndexForModal] = useState<number | null>(null);
  const [avatarError, setAvatarError] = useState(false);

  const insightsInFlightRef = useRef<Record<string, boolean>>({});
  const nextInFlightRef = useRef<Record<string, boolean>>({});

  async function handleDeployClick() {
    try {
      setDeploying(true);
      const picked = nextActions.filter((_, i) => selectedActions[i]);

      if (picked.length > 0) {
        const firstAction = picked[0];
        if (firstAction.type === 'startExampleText') {
          const raw = String(firstAction.payload || '');
          const newExamples = raw
            .split('/')
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 3);

          if (newExamples.length > 0) {
            const getRes = await fetch('/api/chatbot', { method: 'GET', cache: 'no-store' });
            const getJson = await getRes.json();
            if (!getRes.ok || !getJson?.ok) {
              throw new Error(getJson?.error || `HTTP ${getRes.status}`);
            }
            const current = getJson?.data || {};
            const putBody = { ...current, examples: newExamples };
            const putRes = await fetch('/api/chatbot', {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(putBody),
            });
            const putJson = await putRes.json();
            if (!putRes.ok || !putJson?.ok) throw new Error(putJson?.error || `HTTP ${putRes.status}`);
          }
        } else if (firstAction.type === 'ui') {
          const demoBaseUrl = "https://gentoo-demo-shop-template.lovable.app/johanna_aldeahome_com_demo";
          const finalUrl = demoBaseUrl + firstAction.payload;
          window.open(finalUrl, "_blank", "noopener,noreferrer");
        } else if (firstAction.type === 'chat') {
          const text = String(firstAction.payload || '').trim();
          console.log('[deploy-chat] payload:', text);
        }
      }

      const boardName = boards[active]?.name || "All";
      await fetch("/api/deploy-actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actions: picked, board: boardName }),
      });
    } finally {
      setDeploying(false);
    }
  }

  function mdToHtml(md: string): string {
    const esc = (md || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // bold **text**
    let s = esc.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    const lines = s.split("\n");
    let html = "";
    let inList = false;
    for (const raw of lines) {
      const line = raw || "";
      const h = line.match(/^\s*(#{1,6})\s+(.*)$/); // headings
      const bullet = line.match(/^\s*[-\*]\s+(.*)$/); // bullets - or *

      if (h) {
        if (inList) { html += "</ul>"; inList = false; }
        const level = Math.min(6, Math.max(1, h[1].length));
        const content = h[2].trim();
        const tag = `h${level}`;
        html += `<${tag} class=\"mt-1 mb-1 text-[13px] font-semibold\">${content}</${tag}>`;
        continue;
      }

      if (bullet) {
        if (!inList) { html += '<ul class="list-disc pl-5 mb-1">'; inList = true; }
        html += `<li>${bullet[1]}</li>`;
        continue;
      }

      if (inList) { html += "</ul>"; inList = false; }
      const t = line.trim();
      if (t.length) html += `<p class=\"mb-1\">${t}</p>`;
    }
    if (inList) html += "</ul>";
    return html;
  }

  async function loadInsightsFor(bubbles: BubbleState[], title: string) {
    const key = title;
    if (insightsInFlightRef.current[key] || insightsCache[key]) {
      return;
    }

    try {
      insightsInFlightRef.current[key] = true;
      const activeBoardName = boardsRef.current?.[active]?.name;
      if (activeBoardName === key) {
        setInsightsLoading(true);
      }

      const { stats, byScore } = summarizeFor(bubbles);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stats, byScore }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const html = mdToHtml(String(data.insights || ""));
      setInsightsCache((prev) => ({ ...prev, [key]: html }));

      if (boardsRef.current?.[active]?.name === key) {
        setInsights(html);
      }
    } catch (e) {
      // 간단한 휴리스틱 폴백
      const { stats, byScore } = summarizeFor(bubbles);
      const top = [...byScore].sort((a, b) => (b.positive - b.negative) - (a.positive - a.negative)).slice(0, 2);
      const low = [...byScore].sort((a, b) => (a.positive - a.negative) - (b.positive - b.negative)).slice(0, 1);
      const md = [
        `- **Positives**: ${stats.p}/${stats.total}, **Negatives**: ${stats.n}, **Unknown**: ${stats.u}`,
        top.length ? `- High potential bins: ${top.map((t) => `${t.score}`).join(", ")}` : "",
        low.length ? `- Weak bin: ${low.map((t) => `${t.score}`).join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const html = mdToHtml(md);
      setInsightsCache((prev) => ({ ...prev, [key]: html }));
      if (boardsRef.current?.[active]?.name === key) {
        setInsights(html);
      }
    } finally {
      if (boardsRef.current?.[active]?.name === key) {
        setInsightsLoading(false);
      }
      delete insightsInFlightRef.current[key];
    }
  }

  async function loadNextFor(bubbles: BubbleState[], title: string) {
    const key = title + ":next";
    if (nextInFlightRef.current[key] || nextCache[key]) {
      return;
    }
    
    try {
      nextInFlightRef.current[key] = true;
      const activeBoardName = boardsRef.current?.[active]?.name;
      if (activeBoardName === title) {
        setNextLoading(true);
      }
      
      const { stats, byScore } = summarizeFor(bubbles);
      const res = await fetch("/api/next-actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stats, byScore }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch next actions");

      const items: NextActionItem[] = Array.isArray(data.actions) ? data.actions : [];
      setNextCache((prev) => ({ ...prev, [key]: items }));
      
      if (boardsRef.current?.[active]?.name === title) {
        setNextActions(items);
        setSelectedActions(Object.fromEntries(items.map((_, i) => [i, false])) as Record<number, boolean>);
        console.log("Next Actions Loaded:", items); // Print full items for debugging
      }
    } catch (err) {
      console.error("Error loading next actions:", err);
      // Fallback or error state
    } finally {
      if (boardsRef.current?.[active]?.name === title) {
        setNextLoading(false);
      }
      delete nextInFlightRef.current[key];
    }
  }

  useEffect(() => {
    if (!hasSimulated) return;
    const key = boards[active]?.name;
    if (!key) return;

    const cachedInsights = insightsCache[key];
    if (cachedInsights) {
      setInsights(cachedInsights);
      setInsightsLoading(false);
    } else {
      setInsights(""); // Clear previous insights
      setInsightsLoading(!!insightsInFlightRef.current[key]);
    }

    const nextKey = key + ":next";
    const cachedNext = nextCache[nextKey];
    if (cachedNext) {
      setNextActions(cachedNext);
      setSelectedActions(Object.fromEntries(cachedNext.map((_, i) => [i, false])) as Record<number, boolean>);
      setNextLoading(false);
    } else {
      setNextActions([]);
      setNextLoading(!!nextInFlightRef.current[nextKey]);
    }
  }, [active, hasSimulated, boards, insightsCache, nextCache]);

  // Ensure the first hypothesis tab is selected by default once any board beyond "All" exists
  useEffect(() => {
    if (!hasStarted) return;
    if (active !== 0) return; // user already on some tab
    const firstTabIndex = boards.findIndex((b) => b.name !== "All");
    if (firstTabIndex > 0) setActive(firstTabIndex);
  }, [boards, hasStarted, active]);

  return (
    <Card className="min-h-full border-0 rounded-none bg-transparent py-3">
      <CardContent className="space-y-3 min-h-0 px-3">
        <div role="tablist" aria-label="Result boards" className="flex items-end gap-1.5 border-b border-border">
          {boards.map((b, i) => (
            b.name === "All" ? null : (
              <button
                key={`${b.name}-${i}`}
                role="tab"
                aria-selected={i === active}
                aria-controls={`panel-${i}`}
                onClick={() => setActive(i)}
                className={`px-3 py-2 text-sm -mb-px border-b-2 transition-colors ${
                  i === active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                }`}
              >
                {b.name}
              </button>
            )
          ))}
        </div>

        {hasStarted && (
        <div id={`panel-${active}`} role="tabpanel" aria-labelledby={`tab-${active}`} className="space-y-3">
          {/* Graph panel */}
          <div className="rounded-md text-sm bg-card/50 p-3">
            <div className="text-xs text-muted-foreground mb-2">Simulation results</div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground flex items-center gap-2.5 flex-wrap">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-full border-2 border-emerald-600 bg-emerald-500" />
                  <span>Positive</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-full border-2 border-rose-500 bg-transparent" />
                  <span>Negative</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-full border-2 border-gray-500 bg-gray-400" />
                  <span>Unknown</span>
                </span>
              </div>
              <div className="overflow-x-auto">
                <div className="w-max">
                  <div className="flex items-end gap-2">
                    {groupedByScore(boards[active]?.bubbles || []).map((indices, idx) => renderColumn(idx + 1, indices, boards[active]?.bubbles || []))}
                  </div>
                  <div className="mt-2 text-[12px] text-muted-foreground text-center">Engagement Score (1~30)</div>
                </div>
              </div>
            </div>
          </div>
          {/* Insights panel */}
          <div className="rounded-md text-sm bg-card/50">
            <div className="px-3 pt-3 text-xs text-muted-foreground mb-2">Insights</div>
            <div className="h-40 overflow-y-auto overscroll-contain px-3 pb-3">
              {!hasSimulated ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                  Waiting for simulation…
                </div>
              ) : insightsLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                  Generating insights…
                </div>
              ) : (
                <div className="text-sm leading-5 tracking-wide" dangerouslySetInnerHTML={{ __html: insights || "<p class=\"text-muted-foreground\">No insights yet.</p>" }} />
              )}
            </div>
          </div>

          {/* Next actions panel */}
          <div className="rounded-md text-sm bg-card/50">
            <div className="px-3 pt-3 text-xs text-muted-foreground mb-2">Next actions</div>
            <div className="max-h-24 overflow-y-auto overscroll-contain px-3 pb-3">
              {!hasSimulated ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                  Waiting for simulation…
                </div>
              ) : nextLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                  Generating next actions…
                </div>
              ) : nextActions.length === 0 ? (
                <div className="text-xs text-muted-foreground">No suggestions.</div>
              ) : (
                <div className="flex flex-col gap-2 tracking-wide">
                  {nextActions.map((a, i) => (
                    <label key={i} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 rounded accent-indigo-500 focus:ring-2 focus:ring-purple-400/50"
                        checked={!!selectedActions[i]}
                        onChange={(e) => setSelectedActions((prev) => ({ ...prev, [i]: e.target.checked }))}
                      />
                      <span className={`truncate ${selectedActions[i] ? "text-purple-400" : "text-white"}`}>{a.content}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end px-3 pb-3">
              <button
                onClick={handleDeployClick}
                disabled={deploying || !Object.values(selectedActions).some(Boolean)}
              className="px-4 py-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md hover:opacity-90 disabled:opacity-60 text-sm flex items-center gap-2"
              >
                {deploying ? "Deploying…" : "Deploy"}
              </button>
            </div>
          </div>
        </div>
        )}

        {/* Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-4xl rounded-xl border border-zinc-800 bg-neutral-950/90 p-6 shadow-2xl">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="shrink-0">
                    <div className="size-12 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 p-[2px]">
                      <div className="grid size-full place-items-center rounded-full bg-neutral-950 overflow-hidden">
                        {modalData?.user_id && !avatarError ? (
                          <div className="relative h-full w-full">
                            <Image
                              src={`/user_facepack/${modalData.user_id}.png`}
                              alt={modalData?.user_id || "user"}
                              fill
                              sizes="48px"
                              className="object-cover [transform:scale(1.1)]"
                              onError={() => setAvatarError(true)}
                            />
                          </div>
                        ) : (
                          <UserIcon className="size-6 text-zinc-300" />
                        )}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="text-base font-semibold text-white">{modalData?.user_id ?? "User"}</div>
                    {modalData?.engagement_score !== undefined && (
                      <div className="mt-1 text-xs text-zinc-400">
                        engagement
                        <span
                          className={`ml-2 inline-flex items-center rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] ${
                            (modalData?.engagement_score ?? 0) >= 20
                              ? "bg-emerald-500/10 text-emerald-400"
                              : (modalData?.engagement_score ?? 0) >= 10
                              ? "bg-sky-500/10 text-sky-400"
                              : "bg-zinc-800 text-zinc-300"
                          }`}
                        >
                          {modalData?.engagement_score}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  className="rounded-md p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                  onClick={() => setModalOpen(false)}
                  aria-label="Close"
                >
                  <CloseIcon className="size-4" />
                </button>
              </div>

              <div className="mt-5 space-y-6">
                {modalLoading ? (
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
                    Loading…
                  </div>
                ) : modalData ? (
                  <div className="space-y-4 text-sm">
                    {lastReason && (
                      <div>
                        <div className="text-xs uppercase tracking-wide text-zinc-500">reason</div>
                        <div className="mt-1 text-sm flex items-center gap-2">
                          {(() => {
                            const s = lastIndexForModal != null ? boards[active]?.bubbles?.[lastIndexForModal] : undefined;
                            const color = s === "positive" ? "text-emerald-400" : s === "negative" ? "text-rose-400" : "text-zinc-400";
                            return (
                              <span className={`inline-flex items-center ${color} text-sm`}>
                                {lastReason}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    {modalData.summary && (
                      <div>
                        <div className="text-xs uppercase tracking-wide text-zinc-500">summary</div>
                        <div className="mt-2 whitespace-pre-wrap leading-relaxed text-zinc-200">
                          {modalData.summary}
                        </div>
                      </div>
                    )}

                    {/* Badges section */}
                    <div className="space-y-3">
                      <div className="text-xs uppercase tracking-wide text-zinc-500">event types & counts</div>
                      <div className="flex flex-wrap gap-2">
                        {/* Activities counts */}
                        {profile && Object.keys(profile.event_counts).length > 0 &&
                          Object.entries(profile.event_counts)
                            .sort((a, b) => b[1] - a[1])
                            .map(([name, count]) => (
                              <span key={name} className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[11px] text-zinc-200">
                                <span className="text-zinc-400">{name}</span>
                                <span className="ml-1 rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">{count}</span>
                              </span>
                            ))}

                        {/* Reviews count */}
                        {profile && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[11px] text-zinc-200">
                            <span className="text-zinc-400">reviews</span>
                            <span className="ml-1 rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">{profile.reviews_count}</span>
                          </span>
                        )}

                        {/* Dialogues badge (user only) */}
                        {profile && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[11px] text-zinc-200">
                            <span className="text-zinc-400">dialogues(user)</span>
                            <span className="ml-1 rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">{profile.dialogues_user_count}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Radar chart (fixed 6 axes) */}
                    {profile && (
                      <div className="mt-2">
                        <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">behavior radar</div>
                        <ChartContainer
                          className="h-[260px] w-full"
                          config={{ a: { label: "count", color: "#22d3ee" } }}
                        >
                          <ResponsiveContainer width="100%" height="100%">
                              <RadarChart data={buildRadarData(profile)}>
                              <PolarGrid />
                              <PolarAngleAxis dataKey="subject" tick={{ fill: "#a1a1aa", fontSize: 10 }} />
                              <PolarRadiusAxis domain={[0, 1]} tickCount={5} tickFormatter={(v: any) => `${v}`} tick={{ fill: "#a1a1aa", fontSize: 10 }} />
                              <Radar dataKey="A" stroke="var(--chart-a)" fill="var(--chart-a)" fillOpacity={0.2} />
                              <ChartTooltip cursor={false} content={RadarTooltipContent} />
                            </RadarChart>
                          </ResponsiveContainer>
                        </ChartContainer>
                        {/* Reviews (card style) */}
                        <div className="mt-6">
                          <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">reviews</div>
                          {profile?.reviews_detail && profile.reviews_detail.length > 0 ? (
                            <div className="flex max-h-56 flex-col gap-3 overflow-auto pr-1">
                              {profile.reviews_detail.map((r, i) => (
                                <div key={`rev-card-${i}`} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="text-[13px] font-medium text-zinc-100">“{r.title || "(no title)"}”</div>
                                    {typeof r.rating === "number" && (
                                      <div className="shrink-0 text-[12px]">
                                        {Array.from({ length: 5 }).map((_, idx) => (
                                          <span key={idx} className={idx < (r.rating ?? 0) ? "text-amber-400" : "text-zinc-600"}>★</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  {r.content && (
                                    <div className="mt-1 text-[12px] leading-relaxed text-zinc-300">{r.content}</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[12px] text-zinc-500">No reviews.</div>
                          )}
                        </div>
                      </div>
                    )}

                  </div>
                ) : (
                  <div className="text-sm text-destructive">No data</div>
                )}
              </div>
            </div>
          </div>
        )}

        {error && <div className="text-sm text-red-500">에러: {error}</div>}
      </CardContent>
    </Card>
  );
}
