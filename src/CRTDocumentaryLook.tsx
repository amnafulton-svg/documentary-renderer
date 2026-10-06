import {useId, type CSSProperties, type ReactNode} from "react";
import {
  AbsoluteFill,
  interpolate,
  random,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export type CRTDocumentaryLookProps = {
  children: ReactNode;
  intensity?: number;
  scanlineOpacity?: number;
  grainOpacity?: number;
  vignetteStrength?: number;
  monochrome?: number;
  warmTint?: number;
  // px the red and blue guns sit off the green one at full intensity (the reference's red/cyan double edges)
  fringe?: number;
  // strength of the faint echo image to the right (signal ghosting)
  ghost?: number;
  style?: CSSProperties;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * A restrained CRT/archival treatment intended for documentary footage.
 * It is deterministic frame-by-frame and adds no audio.
 */
export const CRTDocumentaryLook = ({
  children,
  intensity = 0.58,
  scanlineOpacity = 0.3,
  grainOpacity = 0.075,
  vignetteStrength = 0.62,
  monochrome = 0.55,
  warmTint = 0,
  fringe = 7,
  ghost = 0.22,
  style,
}: CRTDocumentaryLookProps) => {
  const frame = useCurrentFrame();
  const noiseId = `crt-documentary-noise-${useId().replace(/:/g, "")}`;
  const {fps} = useVideoConfig();
  const signalId = `crt-documentary-signal-${useId().replace(/:/g, "")}`;
  const amount = clamp01(intensity);
  const noiseSeed = Math.floor(frame / 2) % 97;
  const jitterX = (random(`crt-jitter-x-${frame}`) - 0.5) * amount * 0.9;
  const jitterY = (random(`crt-jitter-y-${frame}`) - 0.5) * amount * 0.4;
  const flicker = 1 - random(`crt-flicker-${frame}`) * amount * 0.018;
  const rollCycle = Math.max(1, Math.round(fps * 4.2));
  const rollTop = interpolate(frame % rollCycle, [0, rollCycle], [-18, 112]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#050606",
        overflow: "hidden",
        ...style,
      }}
    >
      <svg style={{position: "absolute", width: 0, height: 0}} aria-hidden>
        <filter
          id={signalId}
          // the region follows the wrapped element (a print can be bigger than the frame while it pans); offsets stay in px
          filterUnits="objectBoundingBox"
          primitiveUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="1"
          height="1"
          colorInterpolationFilters="sRGB"
        >
          {/* red and blue guns out of convergence; channels don't overlap, so adding them rebuilds the picture */}
          <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r0" />
          <feOffset in="r0" dx={-fringe * amount} dy="0" result="r" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b0" />
          <feOffset in="b0" dx={fringe * amount} dy="0" result="b" />
          <feComposite in="r" in2="g" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="rg" />
          <feComposite in="rg" in2="b" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="rgb" />
          {/* ghost: a faint, soft echo of the picture a little to the right */}
          <feOffset in="rgb" dx={fringe * 2.4 * amount} dy="0" result="echo0" />
          <feGaussianBlur in="echo0" stdDeviation="1.5 0" result="echo" />
          <feComposite in="rgb" in2="echo" operator="arithmetic" k1="0" k2={1 - ghost * amount * 0.5} k3={ghost * amount} k4="0" />
        </filter>
      </svg>
      <AbsoluteFill
        style={{
          overflow: "hidden",
          backgroundColor: "black",
        }}
      >
        <AbsoluteFill
          style={{
            transform: `translate(${jitterX}px, ${jitterY}px) scale(1.018)`,
            filter: [
              `url(#${signalId})`,
              `brightness(${flicker * (1 + amount * 0.06)})`,
              `contrast(${1 + amount * 0.38})`,
              `saturate(${1 - clamp01(monochrome) * amount * 0.7})`,
              `sepia(${clamp01(warmTint) * amount})`,
              `blur(${amount * 0.7}px)`,
            ].join(" "),
          }}
        >
          {children}
        </AbsoluteFill>

        <AbsoluteFill
          style={{
            background:
              "linear-gradient(90deg, rgba(255,40,25,0.045), transparent 1.8%, transparent 98.2%, rgba(42,105,255,0.05))",
            mixBlendMode: "screen",
            opacity: amount,
          }}
        />

        <AbsoluteFill
          style={{
            backgroundImage:
              "repeating-linear-gradient(180deg, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 1px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 4px, rgba(0,0,0,0.52) 5px)",
            opacity: clamp01(scanlineOpacity) * amount,
            mixBlendMode: "multiply",
          }}
        />

        <AbsoluteFill
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, rgba(255,40,40,0.28) 0px, rgba(255,40,40,0.28) 1px, rgba(40,255,115,0.18) 1px, rgba(40,255,115,0.18) 2px, rgba(70,120,255,0.24) 2px, rgba(70,120,255,0.24) 3px)",
            opacity: 0.055 * amount,
            mixBlendMode: "screen",
          }}
        />

        <svg
          width="100%"
          height="100%"
          viewBox="0 0 1920 1080"
          preserveAspectRatio="none"
          style={{position: "absolute", inset: 0, mixBlendMode: "soft-light"}}
        >
          <filter id={noiseId}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.78"
              numOctaves="3"
              seed={noiseSeed}
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect
            width="1920"
            height="1080"
            filter={`url(#${noiseId})`}
            opacity={clamp01(grainOpacity) * amount}
          />
        </svg>

        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${rollTop}%`,
            height: "13%",
            transform: "translateY(-50%)",
            background:
              "linear-gradient(180deg, transparent, rgba(215,235,218,0.05), transparent)",
            filter: "blur(12px)",
            opacity: amount * 0.65,
            mixBlendMode: "screen",
          }}
        />

        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse at center, transparent 46%, rgba(0,0,0,${
              clamp01(vignetteStrength) * 0.22
            }) 72%, rgba(0,0,0,${clamp01(vignetteStrength) * 0.86}) 100%)`,
            boxShadow:
              "inset 0 0 55px rgba(0,0,0,0.42), inset 0 0 4px rgba(210,238,217,0.2)",
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
