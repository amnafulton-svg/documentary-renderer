import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  Sequence,
  Video,
  interpolate,
  random,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export type ReferenceCutawayCaption = {
  from: number;
  to: number;
  text: string;
};

export type ReferenceCutawayProps = {
  subjectSrc: string;
  contextSrc: string;
  subjectType?: "image" | "video";
  contextType?: "image" | "video";
  audioSrc?: string;
  headline?: string;
  captions?: ReferenceCutawayCaption[];
  contextFadeStart?: number;
  contextFadeEnd?: number;
  cardMoveStart?: number;
  cardMoveEnd?: number;
  monochrome?: boolean;
};

const FULL_CARD = { left: 418, top: 150, width: 1084, height: 780 };
const CORNER_CARD = { left: 100, top: 120, width: 640, height: 450 };

const resolveSource = (source: string) => {
  if (/^(https?:|data:|blob:)/i.test(source)) {
    return source;
  }

  return staticFile(source.replace(/^[/\\]+/, ""));
};

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const Media: React.FC<{
  src: string;
  type: "image" | "video";
  muted?: boolean;
  style: React.CSSProperties;
}> = ({ src, type, muted = true, style }) => {
  const resolved = resolveSource(src);

  if (type === "video") {
    return <Video src={resolved} muted={muted} style={style} />;
  }

  return <Img src={resolved} style={style} />;
};

const FilmTexture: React.FC = () => {
  const frame = useCurrentFrame();
  const flicker = 0.84 + Math.sin(frame * 1.71) * 0.035;
  const scratchShift = (frame * 13) % 1920;

  return (
    <AbsoluteFill
      style={{
        zIndex: 8,
        pointerEvents: "none",
        opacity: flicker,
        mixBlendMode: "screen",
        overflow: "hidden",
      }}
    >
      <AbsoluteFill
        style={{
          opacity: 0.12,
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(255,255,255,.1) 4px, transparent 5px)",
          transform: `translateY(${frame % 5}px)`,
        }}
      />
      {[0, 1, 2].map((index) => {
        const baseX = random(`reference-scratch-${index}`) * 1920;
        const x = (baseX + scratchShift * (0.35 + index * 0.18)) % 1920;
        const visible = (frame + index * 11) % 47 < 18;

        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: x,
              top: -40,
              width: index === 1 ? 2 : 1,
              height: 1160,
              opacity: visible ? 0.34 : 0,
              background:
                "linear-gradient(180deg, transparent, rgba(255,238,196,.62) 14%, rgba(255,255,255,.25) 52%, transparent)",
              transform: `rotate(${index % 2 === 0 ? -0.35 : 0.28}deg)`,
              filter: "blur(.25px)",
            }}
          />
        );
      })}
      {Array.from({ length: 24 }, (_, index) => {
        const x = random(`reference-dust-x-${index}`) * 1920;
        const y =
          (random(`reference-dust-y-${index}`) * 1080 +
            frame * (2 + (index % 4))) %
          1080;
        const size = 1 + random(`reference-dust-size-${index}`) * 3;

        return (
          <div
            key={`dust-${index}`}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size,
              height: size,
              borderRadius: "50%",
              opacity: 0.12 + (index % 3) * 0.05,
              backgroundColor: "#fff2cf",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

export const ReferenceCutaway: React.FC<ReferenceCutawayProps> = ({
  subjectSrc,
  contextSrc,
  subjectType = "image",
  contextType = "image",
  audioSrc,
  headline = "THE ANIMAL",
  captions = [],
  contextFadeStart = 96,
  contextFadeEnd = 111,
  cardMoveStart = 111,
  cardMoveEnd = 126,
  monochrome = true,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const easeOut = Easing.out(Easing.cubic);

  const entrance = interpolate(frame, [2, 14], [0, 1], {
    ...clamp,
    easing: easeOut,
  });
  const contextOpacity = interpolate(
    frame,
    [contextFadeStart, contextFadeEnd],
    [0, 1],
    { ...clamp, easing: Easing.inOut(Easing.quad) },
  );
  const contextBlur = interpolate(
    frame,
    [contextFadeStart, contextFadeEnd],
    [24, 0],
    clamp,
  );
  const move = interpolate(frame, [cardMoveStart, cardMoveEnd], [0, 1], {
    ...clamp,
    easing: easeOut,
  });
  const cardLeft = interpolate(
    move,
    [0, 1],
    [FULL_CARD.left, CORNER_CARD.left],
  );
  const cardTop = interpolate(move, [0, 1], [FULL_CARD.top, CORNER_CARD.top]);
  const cardWidth = interpolate(
    move,
    [0, 1],
    [FULL_CARD.width, CORNER_CARD.width],
  );
  const cardHeight = interpolate(
    move,
    [0, 1],
    [FULL_CARD.height, CORNER_CARD.height],
  );
  const headlineSize = interpolate(move, [0, 1], [56, 36]);
  const headlineTop = interpolate(move, [0, 1], [28, 34]);
  const headlinePadX = interpolate(move, [0, 1], [24, 16]);
  const headlinePadY = interpolate(move, [0, 1], [10, 7]);
  const caption = captions.find((cue) => frame >= cue.from && frame < cue.to);

  const subjectFilter = monochrome
    ? "grayscale(1) contrast(1.08) brightness(.96)"
    : "contrast(1.04)";
  const contextFilter = `${monochrome ? "grayscale(1) contrast(1.08) " : ""}blur(${contextBlur}px)`;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#090705",
        overflow: "hidden",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <AbsoluteFill style={{ transform: "scale(1.11)" }}>
        <Media
          src={subjectSrc}
          type={subjectType}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter:
              "grayscale(1) sepia(1) saturate(1.5) hue-rotate(344deg) blur(42px) brightness(.42)",
            opacity: 0.82,
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 47% 40%, rgba(140,82,25,.46), transparent 49%), linear-gradient(90deg, rgba(0,0,0,.78), rgba(57,28,8,.2) 48%, rgba(0,0,0,.8))",
          opacity: 1 - contextOpacity,
        }}
      />

      <Sequence
        from={contextFadeStart}
        durationInFrames={durationInFrames - contextFadeStart}
      >
        <AbsoluteFill
          style={{
            opacity: contextOpacity,
            transform: `scale(${interpolate(frame, [contextFadeStart, durationInFrames], [1.035, 1], clamp)})`,
          }}
        >
          <Media
            src={contextSrc}
            type={contextType}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: contextFilter,
            }}
          />
        </AbsoluteFill>
      </Sequence>

      <AbsoluteFill
        style={{
          zIndex: 3,
          background:
            "radial-gradient(ellipse at center, transparent 46%, rgba(0,0,0,.32) 75%, rgba(0,0,0,.72) 100%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          zIndex: 5,
          left: cardLeft,
          top: cardTop + (1 - entrance) * 18,
          width: cardWidth,
          height: cardHeight,
          opacity: entrance,
          transform: `scale(${0.88 + entrance * 0.12})`,
          transformOrigin: "50% 50%",
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "0 18px 42px rgba(0,0,0,.38)",
          backgroundColor: "#292929",
        }}
      >
        <Media
          src={subjectSrc}
          type={subjectType}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: subjectFilter,
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          zIndex: 9,
          left: cardLeft + cardWidth / 2,
          top: headlineTop + (1 - entrance) * 12,
          transform: "translateX(-50%)",
          opacity: entrance,
          whiteSpace: "nowrap",
          borderRadius: 9,
          padding: `${headlinePadY}px ${headlinePadX}px`,
          color: "#fff",
          background: "linear-gradient(180deg, #990706 0%, #700000 100%)",
          boxShadow: "0 7px 12px rgba(0,0,0,.5)",
          fontSize: headlineSize,
          lineHeight: 1,
          fontWeight: 900,
          letterSpacing: -1.8,
          textShadow: "0 2px 1px rgba(0,0,0,.45)",
        }}
      >
        {headline}
      </div>

      <FilmTexture />

      {caption ? (
        <div
          style={{
            position: "absolute",
            zIndex: 10,
            left: 70,
            right: 70,
            bottom: 43,
            textAlign: "center",
            color: "#fff",
            fontSize: 55,
            lineHeight: 1.05,
            fontWeight: 900,
            letterSpacing: -1.8,
            WebkitTextStroke: "2.5px rgba(0,0,0,.9)",
            paintOrder: "stroke fill",
            textShadow: "0 4px 5px rgba(0,0,0,.9)",
          }}
        >
          {caption.text}
        </div>
      ) : null}

      {audioSrc ? <Audio src={resolveSource(audioSrc)} /> : null}
    </AbsoluteFill>
  );
};
