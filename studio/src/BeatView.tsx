import React from 'react';
import {Clips, Photo, Background} from './media';
import {Label, Title} from './templates/Starter';
import type {Beat} from './types';

export type {Beat} from './types';

/**
 * One beat on screen. 'regular' = a photo, 'video' = film; every other mode is one of your templates.
 * To add a template: write its component (see templates/Starter.tsx), add a case here, and describe it in
 * templates.json so the director knows when and how to use it.
 */
export const BeatView: React.FC<{beat: Beat}> = ({beat}) => {
  switch (beat.mode) {
    case 'video': return <Clips asset={beat.assets[0]} />;
    case 'regular': return <Photo asset={beat.assets[0]} />;
    case 'TITLE': return <Title beat={beat} />;
    case 'LABEL': return <Label beat={beat} />;
    default: return <Background asset={beat.assets[0]} />; // unknown mode: show its picture rather than nothing
  }
};
