import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RightHistoryPanel() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>히스토리</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground">
          우측 패널: 실행 요약 카드 나열, 재실행/필터 영역.
        </div>
      </CardContent>
    </Card>
  );
}
