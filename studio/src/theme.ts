/** The channel's look (Studio → Channels). Templates read ACCENT / TEXT_ACCENT / PAPER at render time.
 *  A channel can leave any of them empty: then the defaults below are used, and PAPER stays null. */
import {staticFile} from 'remotion';

export type Theme = {bar?: string; text?: string; paper?: string};
const HEX = /^#[0-9a-fA-F]{6}$/;
export const DEFAULT_THEME = {bar: '#2f6fed', text: '#2f6fed'};
export let ACCENT = DEFAULT_THEME.bar; // bars, tags, boxes
export let TEXT_ACCENT = DEFAULT_THEME.text; // highlighted words and numbers
export let PAPER: string | null = null; // the channel's paper picture (16:9, 2400x1350) for templates that sit on paper
export const applyTheme = (theme?: Theme | null) => {
  ACCENT = theme?.bar && HEX.test(theme.bar) ? theme.bar : DEFAULT_THEME.bar;
  TEXT_ACCENT = theme?.text && HEX.test(theme.text) ? theme.text : DEFAULT_THEME.text;
  PAPER = theme?.paper ? staticFile(theme.paper) : null;
};
export const FONT = 'Arial, Helvetica, sans-serif';
