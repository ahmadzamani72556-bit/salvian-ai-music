import PremiumMusicStudio from "../components/premium-music-studio";
import FullscreenAiAssistant from "../components/fullscreen-ai-assistant";
import MusicGenerationShell from "../components/music-generation-shell";

export default function HomePage() {
  return (
    <MusicGenerationShell>
      <PremiumMusicStudio />
      <FullscreenAiAssistant />
    </MusicGenerationShell>
  );
}
