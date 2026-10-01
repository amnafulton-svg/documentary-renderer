import archive from "../public/archive.json";
import { Composition } from "remotion";
import { ArchiveDocumentary } from "./ArchiveDocumentary";
import { IntroFlashOverlay } from "./IntroFlashOverlay";
import { ReferenceCutaway } from "./ReferenceCutaway";
import { SubtitlesOnly } from "./SubtitlesOnly";
import { VintageOverlay } from "./VintageOverlay";
import { UpgradeShowcase } from "./UpgradeShowcase";
import type { ArchiveData } from "./types";

const data = archive as ArchiveData;
const fps = data.fps || 30;
const durationInFrames = Math.max(1, Math.ceil((data.duration || 8) * fps));

export const Root = () => {
  return (
    <>
      <Composition
        id="ArchiveDocumentary"
        component={ArchiveDocumentary}
        durationInFrames={durationInFrames}
        fps={fps}
        width={1920}
        height={1080}
        defaultProps={{ data }}
        // local stills pass each video's own archive.json as --props, so its length must come from the props
        calculateMetadata={({ props }) => {
          const d = (props as { data: ArchiveData }).data;
          const f = d.fps || 30;
          return { fps: f, durationInFrames: Math.max(1, Math.ceil((d.duration || 8) * f)) };
        }}
      />
      <Composition
        id="ReferenceCutaway"
        component={ReferenceCutaway}
        durationInFrames={163}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          subjectSrc: "images/001.png",
          contextSrc: "images/002.png",
          subjectType: "image",
          contextType: "image",
          headline: "THE ANIMAL",
          captions: [
            { from: 0, to: 18, text: "People" },
            { from: 18, to: 41, text: "called him" },
            { from: 41, to: 56, text: "after he" },
            { from: 56, to: 86, text: "bit off a piece" },
            { from: 86, to: 111, text: "of a man's face" },
            { from: 111, to: 137, text: "during a fight" },
            { from: 137, to: 158, text: "in a nightclub" },
          ],
        }}
      />
      <Composition
        id="VintageOverlay"
        component={VintageOverlay}
        durationInFrames={10 * 30}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="IntroFlashOverlay"
        component={IntroFlashOverlay}
        durationInFrames={66}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="UpgradeShowcase"
        component={UpgradeShowcase}
        durationInFrames={24 * 30}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="FederalReserveSubtitlesOnly"
        component={SubtitlesOnly}
        durationInFrames={durationInFrames}
        fps={fps}
        width={1920}
        height={1080}
        defaultProps={{ captions: data.captions ?? [] }}
      />
    </>
  );
};
