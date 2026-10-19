import PremiumMusicStudio from "../components/premium-music-studio";
import FullscreenAiAssistant from "../components/fullscreen-ai-assistant";
import MusicGenerationShell from "../components/music-generation-shell";
import Stage2ReferenceUploadBridge from "../components/stage2-reference-upload-bridge";

export default function HomePage() {
  return (
    <MusicGenerationShell>
      <Stage2ReferenceUploadBridge>
        <PremiumMusicStudio />
        <FullscreenAiAssistant />
      </Stage2ReferenceUploadBridge>
    </MusicGenerationShell>
  );
}
