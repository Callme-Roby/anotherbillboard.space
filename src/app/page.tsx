import { Legend } from "@/components/scene/Legend";
import { Minimap } from "@/components/scene/Minimap";
import { SceneCanvas } from "@/components/scene/SceneCanvas";

export default function Home() {
  return (
    <main className="relative h-dvh w-dvw overflow-hidden bg-black">
      <SceneCanvas />
      <Minimap />
      <Legend />
    </main>
  );
}
