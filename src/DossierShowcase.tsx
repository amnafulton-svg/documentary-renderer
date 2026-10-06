import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {DossierCard} from './Dossier';
import type {ArchiveDossier} from './types';

// Studio preview of the three dossier card kinds with sample portraits (public/dossier_demo).
const CARDS: Array<{d: ArchiveDossier; len: number}> = [
  {len: 210, d: {kind: 'title', photo: 'dossier_demo/h3.png', title: 'Walter P. Chrysler', at: 0.6,
    subtitle: 'Leaves Buick and takes over *Maxwell Motor* in 1921', subtitleAt: 1.8}},
  {len: 330, d: {kind: 'lineup', returnAt: 9.0, people: [
    {name: 'Sergio Marchionne', photo: 'dossier_demo/s1.png', at: 0.6},
    {name: 'Carlos Tavares', photo: 'dossier_demo/s2.png', at: 2.6, cross: 6.4},
    {name: 'Ludwig Erhard', photo: 'dossier_demo/s4.png', at: 4.4, cross: 7.2},
  ]}},
  {len: 240, d: {kind: 'list', title: 'The 1952 Burden Sharing', at: 0.4, items: [
    {text: 'Half of all *property*', at: 2.0},
    {text: 'Paid over *thirty years*', at: 3.6},
    {text: 'Refugees *compensated*', at: 5.2},
  ]}},
];

export const DOSSIER_SHOWCASE_FRAMES = CARDS.reduce((a, c) => a + c.len, 0);

const Card = ({d, len, i}: {d: ArchiveDossier; len: number; i: number}) => {
  const frame = useCurrentFrame();
  return <DossierCard dossier={d} frame={frame} durationInFrames={len} seed={`show${i}`} />;
};

export const DossierShowcase = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{background: '#212121'}}>
      {CARDS.map((c, i) => {
        const s = from;
        from += c.len;
        return (
          <Sequence key={i} from={s} durationInFrames={c.len}>
            <Card d={c.d} len={c.len} i={i} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
