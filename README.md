# SALVIAN AI MUSIC

SALVIAN AI MUSIC is the music studio inside the wider SALVIAN AI ecosystem.

## SALVIAN AI ecosystem

The products stay focused but share one consistent Salvian experience:

- **SALVIAN AI MUSIC** — songs, lyrics, style, vocals and music projects.
- **SALVIAN AI VIDEO** — video creation and editing workflows.
- **Future SALVIAN AI tools** — additional creator workflows can be added without changing the core identity.

## Music MVP

- Mobile-first creation screen
- AI lyric assistant
- Free-text style + vocal direction
- Audio and voice inputs prepared for expansion
- Advanced controls behind an Advanced switch
- Model selector
- Project/library navigation foundation
- Secure server-side AI endpoint

The real audio generation engine is kept behind an integration layer. It will only be marked production-ready after a real, authorized generation service is connected and tested.

## Environment

`OPENAI_API_KEY` enables the server-side lyric assistant. `OPENAI_LYRICS_MODEL` can optionally select the text model.

Never expose API keys in browser code.

## Deployment

SALVIAN AI MUSIC production deployments are tracked from the `main` branch through the connected Vercel project.
