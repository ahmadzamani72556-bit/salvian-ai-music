import PremiumMusicStudio from "../components/premium-music-studio";
import FullscreenAiAssistant from "../components/fullscreen-ai-assistant";
import MusicGenerationShell from "../components/music-generation-shell";
import Stage2ReferenceFlow from "../components/stage2-reference-flow";

export default function HomePage() {
  return (
    <MusicGenerationShell>
      <Stage2ReferenceFlow>
        <PremiumMusicStudio />
        <FullscreenAiAssistant />
      </Stage2ReferenceFlow>
    </MusicGenerationShell>
  );
}
