import {continueRender, delayRender, staticFile} from 'remotion';

// Linux render runners don't ship the Windows fonts the graphics are designed with
// (Bahnschrift, Georgia). Register open-licence look-alikes under those names so
// the font stacks in the components resolve to them.
const faces: Array<[string, string, string, string]> = [
  ['Bahnschrift', 'fonts/BarlowSemiCondensed-Regular.ttf', '400', 'normal'],
  ['Bahnschrift', 'fonts/BarlowSemiCondensed-Medium.ttf', '500', 'normal'],
  ['Bahnschrift', 'fonts/BarlowSemiCondensed-SemiBold.ttf', '600', 'normal'],
  ['Bahnschrift', 'fonts/BarlowSemiCondensed-Bold.ttf', '700', 'normal'],
  ['Bahnschrift', 'fonts/BarlowSemiCondensed-ExtraBold.ttf', '800 900', 'normal'],
  ['Georgia', 'fonts/Gelasio.ttf', '400 700', 'normal'],
  ['Georgia', 'fonts/Gelasio-Italic.ttf', '400 700', 'italic'],
];

if (typeof document !== 'undefined' && typeof FontFace !== 'undefined') {
  const handle = delayRender('Loading fonts');
  Promise.all(
    faces.map(([family, file, weight, style]) => {
      const face = new FontFace(family, `url(${staticFile(file)})`, {weight, style});
      return face.load().then(() => document.fonts.add(face));
    }),
  )
    .then(() => continueRender(handle))
    .catch((err) => {
      console.error('Font loading failed', err);
      continueRender(handle);
    });
}
