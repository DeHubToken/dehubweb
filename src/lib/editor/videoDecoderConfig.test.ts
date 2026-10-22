import { describe, expect, it } from "vitest";
import { avcDecoderConfig, splitAnnexB, splitLengthPrefixed, toLengthPrefixed, videoDecoderConfigFixer } from "./videoDecoderConfig";

const sps = new Uint8Array([0x67, 0x42, 0xe0, 0x28, 0xda, 0x01]);
const pps = new Uint8Array([0x68, 0xce, 0x3c, 0x80]);
const idr = new Uint8Array([0x65, 0x88, 0x84, 0x00]);
const slice = new Uint8Array([0x41, 0x9a, 0x02]);
const annexB = (...nals: Uint8Array[]) => new Uint8Array(nals.flatMap((nal) => [0, 0, 0, 1, ...nal]));
const chunk = (type: "key" | "delta", data: Uint8Array, timestamp = 0) =>
  ({ type, timestamp, duration: 33_333, byteLength: data.length, copyTo: (dest: Uint8Array) => dest.set(data) }) as unknown as EncodedVideoChunk;
const make = (init: { type: EncodedVideoChunkType; timestamp: number; duration?: number; data: Uint8Array }) =>
  chunk(init.type, init.data, init.timestamp);
const bytesOf = (c: EncodedVideoChunk) => { const out = new Uint8Array(c.byteLength); c.copyTo(out); return out; };
const options = { codec: "avc1.42E028", muxerCodec: "avc" as const, width: 1920, height: 1080 };

describe("video decoder config", () => {
  it("splits and rejoins NAL units", () => {
    expect(splitAnnexB(annexB(sps, pps, idr))).toEqual([sps, pps, idr]);
    expect(splitLengthPrefixed(toLengthPrefixed([sps, pps]))).toEqual([sps, pps]);
    expect(splitLengthPrefixed(annexB(sps))).toBeNull();
  });

  it("builds avcC from SPS and PPS", () => {
    const config = avcDecoderConfig([sps, pps, idr], 1920, 1080)!;
    expect(config.codec).toBe("avc1.42E028");
    expect(Array.from(config.description as Uint8Array)).toEqual([1, 0x42, 0xe0, 0x28, 0xff, 0xe1, 0, 6, ...sps, 1, 0, 4, ...pps]);
    expect(config.colorSpace).toBeTruthy();
  });

  it("fills a missing config and rewrites Annex B chunks (Firefox)", () => {
    const fix = videoDecoderConfigFixer(options, make);
    const first = fix(chunk("key", annexB(sps, pps, idr)), undefined);
    expect(first.meta?.decoderConfig?.codec).toBe("avc1.42E028");
    expect(splitLengthPrefixed(bytesOf(first.chunk))).toEqual([sps, pps, idr]);
    const next = fix(chunk("delta", annexB(slice), 33_333), undefined);
    expect(next.meta).toBeUndefined();
    expect(splitLengthPrefixed(bytesOf(next.chunk))).toEqual([slice]);
  });

  it("reads in-band SPS/PPS from length-prefixed chunks", () => {
    const fix = videoDecoderConfigFixer(options, make);
    const data = toLengthPrefixed([sps, pps, idr]);
    const first = fix(chunk("key", data), {});
    expect(first.meta?.decoderConfig?.description).toBeTruthy();
    expect(bytesOf(first.chunk)).toEqual(data);
  });

  it("leaves a browser-provided config alone (Chrome, Safari)", () => {
    const fix = videoDecoderConfigFixer(options, make);
    const decoderConfig = { codec: "avc1.42E028", description: new Uint8Array([1, 2, 3]) };
    const c = chunk("key", toLengthPrefixed([idr]));
    const out = fix(c, { decoderConfig });
    expect(out.chunk).toBe(c);
    expect(out.meta?.decoderConfig).toBe(decoderConfig);
  });

  it("gives VP9 a colour space and a config when none arrives", () => {
    const fix = videoDecoderConfigFixer({ ...options, codec: "vp09.00.10.08", muxerCodec: "vp9" }, make);
    const out = fix(chunk("key", new Uint8Array([1, 2])), undefined);
    expect(out.meta?.decoderConfig).toMatchObject({ codec: "vp09.00.10.08", codedWidth: 1920, colorSpace: { primaries: "bt709" } });
  });
});
