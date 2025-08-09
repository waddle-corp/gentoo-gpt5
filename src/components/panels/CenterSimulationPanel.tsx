import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CenterSimulationPanel() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>시뮬레이션 결과</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground">
          가운데 패널: 투표/분포/이유 시각화(Recharts) 및 진행상태 표시.
        </div>
      </CardContent>
    </Card>
  );
}
