import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CenterSimulationPanel() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Simulation Results</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground">
          Center panel: Vote/distribution/reason visualization (Recharts) and progress status.
        </div>
      </CardContent>
    </Card>
  );
}
