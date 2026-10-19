import PremiumMusicStudio from "../components/premium-music-studio";
import MusicGenerationShell from "../components/music-generation-shell";

export default function HomePage() {
  return (
    <MusicGenerationShell>
      <PremiumMusicStudio />
    </MusicGenerationShell>
  );
}
