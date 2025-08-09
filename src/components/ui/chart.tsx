"use client";

import React from "react";
import { Tooltip as RechartsTooltip, TooltipProps } from "recharts";
import { cn } from "@/lib/utils";

export type ChartConfig = Record<string, { label?: string; color?: string }>;

const ChartConfigContext = React.createContext<ChartConfig | null>(null);

type ChartContainerProps = React.ComponentProps<"div"> & {
  config?: ChartConfig;
};

export function ChartContainer({
  config,
  className,
  style,
  ...props
}: ChartContainerProps) {
  const styleVars: Record<string, string> = {};
  if (config) {
    for (const [key, value] of Object.entries(config)) {
      if (value?.color) {
        // Expose color as CSS variable for easy use: var(--chart-${key})
        styleVars[`--chart-${key}`] = value.color;
      }
    }
  }
  return (
    <ChartConfigContext.Provider value={config ?? null}>
      <div className={cn("text-xs", className)} style={{ ...(style ?? {}), ...styleVars }} {...props} />
    </ChartConfigContext.Provider>
  );
}

export function useChartConfig() {
  return React.useContext(ChartConfigContext);
}

type ChartTooltipProps = Omit<TooltipProps<number, string>, "content"> & {
  content?: React.ComponentType<ChartTooltipContentProps>;
};

export function ChartTooltip({ content: Content = ChartTooltipContent, ...props }: ChartTooltipProps) {
  return <RechartsTooltip {...props} content={<Content />} />;
}

export type ChartTooltipContentProps = {
  active?: boolean;
  label?: string | number;
  payload?: Array<{
    color?: string;
    name?: string;
    value?: number | string;
    dataKey?: string;
  }>;
};

export function ChartTooltipContent({ active, label, payload }: ChartTooltipContentProps) {
  const config = useChartConfig();
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow">
      {label !== undefined && (
        <div className="mb-1 text-[11px] font-medium text-muted-foreground">{String(label)}</div>
      )}
      <div className="space-y-1">
        {payload.map((entry, idx) => {
          const key = entry.dataKey ?? entry.name ?? String(idx);
          const conf = (key && config && config[key]) || undefined;
          const dotColor = conf?.color ?? entry.color ?? "var(--color-primary)";
          const labelText = conf?.label ?? entry.name ?? key;
          return (
            <div key={`${key}-${idx}`} className="flex items-center gap-2">
              <span className="inline-block size-2 rounded" style={{ background: dotColor }} />
              <span className="text-[11px] text-muted-foreground">{labelText}</span>
              <span className="ml-auto text-[11px] font-medium">{entry.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}


