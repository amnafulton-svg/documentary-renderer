# Documentary Renderer

GitHub Actions renderer for the documentary-style cuts built by Archive Remotion Factory
(documentary 3D maps, odometer stats, gold-bar lower-thirds, archive film clips, punch-ins).

## Render a video

1. Zip the contents of the renderer's `public/` folder (only the files `archive.json` references):
   `archive.json`, `audio/`, `images/`, `clips/`, `maps/`, `sfx/`. Use a plain ASCII zip name.
2. Create a release (e.g. `v1`) and attach the zip. Several zips in one release render in parallel.
3. Actions → **Render Documentary Release Zips** → Run workflow with `release_tag`.

The workflow splits every video into chunks (`workers_per_video`, default 16), renders them in parallel,
stitches them, renders the soundtrack (voice-over + SFX) with Remotion, and uploads a `final-<name>`
artifact with the MP4 (kept 30 days).

```bash
gh workflow run render-release.yml -f release_tag=v1
gh run download <run-id> -n final-<name>
```

## Notes

- `src/` is a copy of `archive-remotion-factory/renderer/src`. `.github/fontconfig/fonts.conf` maps the open-licence
  Barlow Semi Condensed and Gelasio fonts (in `public/fonts/`, SIL OFL) (installed on the runner) to Bahnschrift and Georgia,
  because Linux runners don't have those Windows fonts.
- Map scenes (`mode: "map"`) are drawn live and don't need an image.
- Never commit `.env` or API keys. Media only travels in release zips.
