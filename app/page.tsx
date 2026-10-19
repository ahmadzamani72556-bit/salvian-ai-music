import MusicUploadBridge from "../components/music-upload-bridge";
import FullscreenAiAssistant from "../components/fullscreen-ai-assistant";
import MusicGenerationShell from "../components/music-generation-shell";
import Stage2ReferenceFlow from "../components/stage2-reference-flow";

export default function HomePage() {
  return (
    <MusicGenerationShell>
      <Stage2ReferenceFlow>
        <MusicUploadBridge />
        <FullscreenAiAssistant />
      </Stage2ReferenceFlow>
    </MusicGenerationShell>
  );
}
