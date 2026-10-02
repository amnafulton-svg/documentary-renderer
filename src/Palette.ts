// The one accent colour of every graphic (charts, stats, lower-thirds, map titles, the main map route),
// and the text colour that sits on it. Change it here only.
export const ACCENT = '#d24a35';
export const ACCENT_RGB = '210,74,53';
export const ON_ACCENT = '#f4efe4';
// map routes in order: the accent, then cream, then a cool blue, so two routes never read as one
export const ROUTE_COLORS = [ACCENT, '#f4efe4', '#5fb4e8'];
export const RETIRED_GOLDS = ['#e3b04b', '#f2b441'];
export const accentA = (alpha: number) => `rgba(${ACCENT_RGB},${alpha})`;
