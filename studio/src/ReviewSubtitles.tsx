import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';

export type SubtitleCue = {from: number; to: number; en: string};

/** Review-only English subtitles (not part of the channel look): plain white text on a dark band at the bottom. */
export const ReviewSubtitles: React.FC<{cues: SubtitleCue[]}> = ({cues}) => {
  const frame = useCurrentFrame();
  const cue = cues.find((c) => frame >= c.from && frame < c.to + 6);
  if (!cue) return null;
  return <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 46, pointerEvents: 'none'}}>
    <div style={{maxWidth: 1500, padding: '10px 22px', background: 'rgba(0,0,0,.62)', color: '#fff', fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: 38, lineHeight: 1.25, textAlign: 'center', borderRadius: 4}}>{cue.en}</div>
  </AbsoluteFill>;
};
