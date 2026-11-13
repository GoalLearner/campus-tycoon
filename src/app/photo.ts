import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNative } from './platform';

/**
 * Photo mode's picture (DESIGN.md 42.5): the campus as the map has just
 * drawn it, with the school's name and rank on a band along the foot. On a
 * phone it goes to the share sheet. In a browser it is shared where the
 * browser can share a file, and saved as a download where it cannot.
 */

export interface PhotoCaption {
  name: string;
  line: string;
}

/** The size of the band and its two lines, for a picture of a given width. */
export function captionLayout(width: number): { band: number; name: number; line: number; pad: number } {
  const unit = Math.max(8, Math.round(width / 26));
  return { band: unit * 5, name: Math.round(unit * 1.8), line: unit, pad: Math.round(unit * 1.1) };
}

/** A file name from the school's name: letters, digits and dashes only. */
export function photoFileName(schoolName: string): string {
  const safe = schoolName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${safe || 'campus'}.png`;
}

/** The picture with its caption drawn on, as a canvas. */
export function composePhoto(image: CanvasImageSource & { width: number; height: number }, caption: PhotoCaption): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const pen = canvas.getContext('2d')!;
  pen.drawImage(image, 0, 0);
  const { band, name, line, pad } = captionLayout(canvas.width);
  pen.fillStyle = 'rgba(20, 26, 22, 0.92)';
  pen.fillRect(0, canvas.height - band, canvas.width, band);
  pen.textBaseline = 'alphabetic';
  pen.fillStyle = '#ffffff';
  pen.font = `700 ${name}px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  pen.fillText(caption.name, pad, canvas.height - band + pad + name * 0.82, canvas.width - 2 * pad);
  pen.fillStyle = '#c8d0c4';
  pen.font = `600 ${line}px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  pen.fillText(caption.line, pad, canvas.height - pad * 0.9, canvas.width - 2 * pad);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no picture'))), 'image/png'));
}

/** Share the picture, or save it. Says which it did. */
export async function sharePhoto(image: CanvasImageSource & { width: number; height: number }, caption: PhotoCaption): Promise<'shared' | 'saved'> {
  const canvas = composePhoto(image, caption);
  const fileName = photoFileName(caption.name);
  if (isNative) {
    // The share sheet takes a file, so the picture is written to the app's cache first.
    const data = canvas.toDataURL('image/png').split(',')[1] ?? '';
    const written = await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache });
    await Share.share({ title: caption.name, files: [written.uri], dialogTitle: 'Share your campus' });
    return 'shared';
  }
  const blob = await toBlob(canvas);
  const file = new File([blob], fileName, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: caption.name });
      return 'shared';
    } catch (err) {
      // The player closed the share sheet: that is an answer, not a failure.
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared';
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'saved';
}
