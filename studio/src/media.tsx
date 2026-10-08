import React from 'react';
import {AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Asset} from './types';

/** A still filling the frame with a slow push-in toward the face (or the centre). Portrait or odd-shaped pictures
 * ('aspect-safe') are shown whole over a blurred copy of themselves. */
export const Photo: React.FC<{asset: Asset}> = ({asset}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const zoom = interpolate(frame, [0, durationInFrames], [1, 1.06]);
  const origin = asset.zoomOrigin ?? asset.objectPosition ?? '50% 50%';
  if (asset.layout === 'aspect-safe') {
    return <AbsoluteFill style={{background: '#111', overflow: 'hidden'}}>
      <Img src={staticFile(asset.src)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(24px) brightness(.45)', transform: 'scale(1.1)'}} />
      <Img src={staticFile(asset.src)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', transform: `scale(${zoom})`, transformOrigin: origin}} />
    </AbsoluteFill>;
  }
  return <AbsoluteFill style={{background: '#111', overflow: 'hidden'}}>
    <Img src={staticFile(asset.src)} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: asset.objectPosition, transform: `scale(${zoom})`, transformOrigin: origin}} />
  </AbsoluteFill>;
};

/** Film beats: the engine already cut and framed every clip to 1920x1080; play them muted, back to back. */
export const Clips: React.FC<{asset: Asset}> = ({asset}) => {
  let from = 0;
  return <AbsoluteFill style={{background: '#111'}}>
    {(asset.videoParts ?? []).map((part) => {
      const shot = <Sequence key={`${part.src}-${from}`} from={from} durationInFrames={part.durationFrames}>
        <OffthreadVideo muted src={staticFile(part.src)} style={{width: '100%', height: '100%'}} />
      </Sequence>;
      from += part.durationFrames;
      return shot;
    })}
  </AbsoluteFill>;
};

/** The background of a template: a film clip (bgfilm=) or a photo (bg=). */
export const Background: React.FC<{asset?: Asset}> = ({asset}) => (
  !asset ? <AbsoluteFill style={{background: '#111'}} /> : asset.layout === 'video' ? <Clips asset={asset} /> : <Photo asset={asset} />
);
