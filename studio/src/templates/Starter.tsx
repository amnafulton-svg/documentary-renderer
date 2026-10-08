import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {Background} from '../media';
import {ACCENT, FONT} from '../theme';
import type {Beat} from '../types';

/**
 * Two plain starter templates so the pipeline works end to end. Replace them with your own designs: add a component,
 * a case in BeatView.tsx and an entry in templates.json (the director only uses templates listed there).
 */
const fadeUp = (frame: number, start: number) => interpolate(frame, [start, start + 12], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

/** TITLE: a short title (and optional subtitle) centred over a darkened picture. */
export const Title: React.FC<{beat: Beat}> = ({beat}) => {
  const f = useCurrentFrame() - (beat.revealShift ?? 0);
  const p = fadeUp(f, 6);
  return <AbsoluteFill>
    <Background asset={beat.assets[0]} />
    <AbsoluteFill style={{background: 'rgba(0,0,0,.45)'}} />
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 160px', fontFamily: FONT, color: '#fff'}}>
      <div style={{opacity: p, transform: `translateY(${(1 - p) * 16}px)`}}>
        <div style={{fontSize: 92, fontWeight: 700, letterSpacing: 1}}>{String(beat.text.title ?? '')}</div>
        {beat.text.subtitle ? <div style={{fontSize: 44, marginTop: 14, opacity: 0.9}}>{String(beat.text.subtitle)}</div> : null}
      </div>
    </AbsoluteFill>
  </AbsoluteFill>;
};

/** LABEL: a name in an accent-coloured box at the bottom left of a full-frame picture. */
export const Label: React.FC<{beat: Beat}> = ({beat}) => {
  const f = useCurrentFrame() - (beat.revealShift ?? 0);
  const p = fadeUp(f, 4);
  return <AbsoluteFill>
    <Background asset={beat.assets[0]} />
    <div style={{position: 'absolute', left: 110, bottom: 120, background: ACCENT, color: '#fff', fontFamily: FONT, fontWeight: 700, fontSize: 48,
      padding: '14px 26px', opacity: p, transform: `translateX(${(1 - p) * -24}px)`}}>{String(beat.text.label ?? '')}</div>
  </AbsoluteFill>;
};
