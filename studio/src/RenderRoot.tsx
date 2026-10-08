import React from 'react';
import {Composition} from 'remotion';
import {DirectorJob, directorMetadata} from './DirectorJob';

export const RenderRoot: React.FC = () => <>
  <Composition id="DirectorJob" component={DirectorJob} defaultProps={{}} calculateMetadata={directorMetadata} durationInFrames={30} fps={30} width={1920} height={1080} />
</>;
