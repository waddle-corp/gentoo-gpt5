import { Card, CardContent } from "@/components/ui/card";
import { Check, X, User } from "lucide-react";

// Single simulation participant mock data
const mockParticipants = [
  { userId: "user_001", nickname: "MomPro", vote: true },
  { userId: "user_002", nickname: "BabyLover", vote: true },
  { userId: "user_003", nickname: "ShopMom", vote: false },
  { userId: "user_004", nickname: "FashionLover", vote: true },
  { userId: "user_005", nickname: "SavingMom", vote: false },
  { userId: "user_006", nickname: "BabyShop", vote: true },
];

const additionalCount = 2; // +2 more

export default function RightHistoryPanel() {
  return (
    <Card className="h-full bg-card/30">
      <CardContent className="p-4">
        <div className="space-y-2">
          {mockParticipants.map((participant: { userId: string; nickname: string; vote: boolean }) => (
            <div key={participant.userId} className="flex items-center gap-3 p-3 rounded-md bg-background/50">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
                <span className="text-sm font-medium truncate text-white">{participant.nickname}</span>
              </div>
              <div className="flex items-center gap-2">
                {participant.vote ? (
                  <Check className="w-5 h-5 text-green-400" />
                ) : (
                  <X className="w-5 h-5 text-red-400" />
                )}
              </div>
            </div>
          ))}
          {additionalCount > 0 && (
            <div className="text-sm text-muted-foreground text-center py-2">
              +{additionalCount} more
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
