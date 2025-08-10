import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = { embedded?: boolean };

export default function CenterSimulationPanel({ embedded }: Props) {
  if (embedded) {
    return (
      <div className="h-full min-h-0 bg-transparent overflow-hidden">
        <CardHeader className="py-4 px-4 md:px-6">
          <CardTitle>Simulation Results</CardTitle>
        </CardHeader>
        <CardContent className="pb-4 px-0 min-h-0" />
      </div>
    );
  }

  return (
    <Card className="h-full overflow-hidden">
      <CardHeader>
        <CardTitle>Simulation Results</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0" />
    </Card>
  );
}
