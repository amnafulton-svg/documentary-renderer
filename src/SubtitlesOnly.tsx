import {AbsoluteFill} from 'remotion';
import {Captions} from './ArchiveDocumentary';
import type {ArchiveCaption} from './types';

export const SubtitlesOnly = ({captions}: {captions: ArchiveCaption[]}) => {
  return (
    <AbsoluteFill style={{backgroundColor: 'transparent'}}>
      <Captions captions={captions} />
    </AbsoluteFill>
  );
};
