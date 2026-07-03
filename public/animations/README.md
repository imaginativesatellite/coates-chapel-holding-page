# Animations

Drop the signature-sent animation here as:

    signature-sent.lottie

- Export from LottieFiles as **dotLottie (.lottie)** (preferred - much smaller);
  a plain Lottie **.json** works too (name it `signature-sent.json`).
- Keep it in this folder (served by Next from `/animations/...`) - never a CDN:
  Presentation Mode runs on booth wifi and a self-hosted file always loads.
- Once the file is committed, ask Claude to wire the player: the swap point is
  the `SuccessCheck` component in
  `src/app/(app)/quote/[id]/SignatureActions.tsx` (currently an SVG checkmark).
