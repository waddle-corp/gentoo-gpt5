import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LeftChatPanel() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>오너 ↔ LLM 대화</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground">
          좌측 패널: 스트리밍 채팅 UI(useChat/assistant-ui) 영역. 추후 입력창/메시지 리스트 배치.
        </div>
      </CardContent>
    </Card>
  );
}
