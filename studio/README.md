# Studio renderer

Remotion project for packages from the Video Studio web app (`director_edit.json` + media). Rendered by
`.github/workflows/studio-render.yml`; the existing `render-release.yml` (ship.py) is separate and unchanged.

`src/` is a copy of the kit's `director/remotion/src` + `director/renderer/DirectorJob.tsx`. When you add or change a
template in the kit, copy the same files into `studio/src/templates/` here too, or the GitHub render won't have it.
