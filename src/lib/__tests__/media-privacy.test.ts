import { describe, expect, it } from 'vitest';
import { scrubMp4Metadata, stripJpegMetadata } from '@/lib/media-privacy';

const box = (type: string, body: Uint8Array): Uint8Array => {
  const out = new Uint8Array(8 + body.length);
  new DataView(out.buffer).setUint32(0, out.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  return out;
};
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let a = 0; for (const x of p) { o.set(x, a); a += x.length; } return o; };
const txt = (s: string) => new TextEncoder().encode(s);
const str = (b: Uint8Array) => new TextDecoder('latin1').decode(b);

describe('media privacy', () => {
  it('blanks phone location in an MP4 without changing its size', () => {
    const file = cat(box('ftyp', txt('isom0000')), box('moov', cat(box('mvhd', txt('mvhd-data')), box('udta', txt('+51.5074-000.1278/ iPhone')))), box('mdat', txt('frames')));
    const out = scrubMp4Metadata(file);
    expect(out.length).toBe(file.length);
    expect(str(out)).not.toContain('51.5074');
    expect(str(out)).toContain('frames');
    expect(str(file)).toContain('51.5074');
  });

  it('drops EXIF from a JPEG and keeps the image data', () => {
    const exif = txt('Exif\0\0GPS 51.5074 Galaxy S24+');
    const app1 = cat(Uint8Array.of(0xff, 0xe1, 0, exif.length + 2), exif);
    const app0 = cat(Uint8Array.of(0xff, 0xe0, 0, 6), txt('JFIF'));
    const scan = cat(Uint8Array.of(0xff, 0xda), txt('pixels'), Uint8Array.of(0xff, 0xd9));
    const jpeg = cat(Uint8Array.of(0xff, 0xd8), app0, app1, scan);
    const out = stripJpegMetadata(jpeg);
    expect(str(out)).not.toContain('Galaxy');
    expect(str(out)).toContain('JFIF');
    expect(str(out)).toContain('pixels');
  });

  it('leaves other bytes alone', () => {
    const png = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8, 9);
    expect(stripJpegMetadata(png)).toBe(png);
    expect(scrubMp4Metadata(png)).toBe(png);
  });
});
