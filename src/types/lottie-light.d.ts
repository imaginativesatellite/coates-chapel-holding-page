// The SVG-only "light" build of lottie-web ships without its own type mapping;
// it exposes the same API as the full player.
declare module "lottie-web/build/player/lottie_light" {
  import lottie from "lottie-web";
  export default lottie;
}
