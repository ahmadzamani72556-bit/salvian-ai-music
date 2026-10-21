import BillingHeaderButton from "../components/billing-header-button";
import MusicBillingGate from "../components/music-billing-gate";
import MusicUploadBridge from "../components/music-upload-bridge";
import FullscreenAiAssistant from "../components/fullscreen-ai-assistant";
import AssistantClearAllControl from "../components/assistant-clear-all-control";
import MusicGenerationShell from "../components/music-generation-shell";
import Stage2ReferenceFlow from "../components/stage2-reference-flow";

export default function HomePage() {
  return (
    <MusicGenerationShell>
      <BillingHeaderButton />
      <MusicBillingGate />
      <Stage2ReferenceFlow>
        <MusicUploadBridge />
        <FullscreenAiAssistant />
        <AssistantClearAllControl />
      </Stage2ReferenceFlow>
    </MusicGenerationShell>
  );
}
