import React from 'react';
import {Composition} from 'remotion';
import {Job, jobMetadata, type JobProps} from './Job';

const empty: JobProps = {jobId: '', audio: '', totalFrames: 30, beats: [], subtitles: null, showSubtitles: false};

export const Root: React.FC = () => <>
  <Composition id="Job" component={Job} defaultProps={empty} calculateMetadata={jobMetadata} durationInFrames={30} fps={30} width={1920} height={1080} />
</>;
