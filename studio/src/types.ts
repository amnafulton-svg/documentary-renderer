/** One beat of an edit (written by engine/build_project.py into jobs/<id>/edit.json). */
export type Asset = {
  src: string;
  /** landscape-cover / aspect-safe: a full-frame still; template-card: a picture inside a template; video: film clips. */
  layout: 'landscape-cover' | 'aspect-safe' | 'template-card' | 'video';
  aspectRatio: number;
  /** CSS object-position that keeps faces in frame (face detection, or meta/focal_overrides.json). */
  objectPosition: string;
  zoomOrigin?: string;
  /** Pre-cut 1920x1080 clips for film beats (and for a template's film background), played back to back. */
  videoParts?: {src: string; durationFrames: number}[];
};

export type Beat = {
  id: string;
  startFrame: number;
  durationFrames: number;
  /** 'regular' (photo), 'video' (film), or one of your templates (a key of templates.json). */
  mode: string;
  narration: string;
  text: Record<string, string | number>;
  /** Template data: anything a template needs beyond text (lists, the OCR box of templates with "ocr", ...). */
  data?: Record<string, unknown>;
  assets: Asset[];
  /** Frames to delay the template's reveal so its key element lands on the cue word. */
  revealShift?: number;
};
