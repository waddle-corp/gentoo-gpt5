import LeftChatPanel from "@/components/panels/LeftChatPanel";
import CenterSimulationPanel from "@/components/panels/CenterSimulationPanel";
import RightHistoryPanel from "@/components/panels/RightHistoryPanel";

export default function Home() {
  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 bg-background">
      <div
        className="grid gap-4 md:gap-6 lg:gap-8"
        style={{ gridTemplateColumns: "1fr 1.4fr" }}
      >
        <div className="min-h-[80vh]"><LeftChatPanel /></div>
        <div className="min-h-[80vh]"><CenterSimulationPanel /></div>
        {/* <div className="min-h-[80vh]"><RightHistoryPanel /></div> */}
      </div>
    </main>
  );
}
