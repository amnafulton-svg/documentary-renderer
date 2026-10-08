import React from 'react';
import {AbsoluteFill, Audio, CalculateMetadataFunction, Sequence, staticFile} from 'remotion';
import {BeatView} from './BeatView';
import {ReviewSubtitles, type SubtitleCue} from './ReviewSubtitles';
import {applyTheme, type Theme} from './theme';
import type {Beat} from './types';

/** One director job: written by engine/build_project.py to jobs/<id>/edit.json and passed in as props. */
export type JobProps = {
  jobId: string;
  audio: string;
  totalFrames: number;
  beats: Beat[];
  subtitles?: SubtitleCue[] | null;
  showSubtitles?: boolean;
  theme?: Theme | null;
};

export const jobMetadata: CalculateMetadataFunction<JobProps> = ({props}) => ({durationInFrames: Math.max(1, props.totalFrames)});

export const Job: React.FC<JobProps> = ({audio, beats, subtitles, showSubtitles, theme}) => {
  applyTheme(theme); // the channel's accent colours, before any template renders
  return <AbsoluteFill style={{background: '#0d0d0d'}}>
    {audio ? <Audio src={staticFile(audio)} /> : null}
    {beats.map((beat) => <Sequence key={beat.id} from={beat.startFrame} durationInFrames={beat.durationFrames} name={`${beat.id} ${beat.mode}`}>
      <BeatView beat={beat} />
    </Sequence>)}
    {showSubtitles && subtitles ? <ReviewSubtitles cues={subtitles} /> : null}
  </AbsoluteFill>;
};
