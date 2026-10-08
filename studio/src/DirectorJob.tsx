// Renderer-side entry for director packages (copied into the renderer repo as src/director/DirectorJob.tsx with the
// director's template files). The package unzips into public/: director_edit.json + jobs/<id>/... + templates/.
import React from 'react';
import {CalculateMetadataFunction, staticFile} from 'remotion';
import {Job, type JobProps} from './Job';

type Props = Partial<JobProps>;

export const directorMetadata: CalculateMetadataFunction<Props> = async () => {
  const edit = (await (await fetch(staticFile('director_edit.json'))).json()) as JobProps & {fps?: number};
  return {durationInFrames: Math.max(1, edit.totalFrames), fps: edit.fps ?? 30, props: edit};
};

export const DirectorJob: React.FC<Props> = (props) => <Job {...(props as JobProps)} />;
