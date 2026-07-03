# Animations

`checkwhite.lottie` is the signature-sent success animation (a white check,
played once on a green badge after "Accept & sign" / "Send for signature").

How it's wired: a `.lottie` file is a zip around a Lottie JSON. The JSON is
extracted to `src/animations/signature-sent.json` and bundled with the SVG-only
`lottie-web` light player - no CDN, no runtime fetch, so it always works on
booth wifi. This folder keeps the original export as the source of truth.

To replace the animation:
1. Drop the new `.lottie` (or `.json`) export in this folder.
2. Ask Claude to re-extract it into `src/animations/signature-sent.json`
   (or unzip it yourself: the JSON lives at `animations/*.json` inside).
