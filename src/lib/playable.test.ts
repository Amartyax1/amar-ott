import { describe, expect, it } from "vitest";
import { guessMime, isLikelyPlayable, parseByteRange } from "./playable";

describe("isLikelyPlayable", () => {
  it("accepts mp4 and webm", () => {
    expect(isLikelyPlayable({ fileName: "Movie.2010.1080p.WEB-DL.mp4" })).toBe(true);
    expect(isLikelyPlayable({ mimeType: "video/mp4" })).toBe(true);
    expect(isLikelyPlayable({ fileName: "clip.webm" })).toBe(true);
  });

  it("rejects HEVC and MKV", () => {
    expect(isLikelyPlayable({ fileName: "Movie.2010.2160p.x265.mp4" })).toBe(false);
    expect(isLikelyPlayable({ fileName: "Show.S01E01.mkv" })).toBe(false);
  });
});

describe("parseByteRange", () => {
  it("parses open-ended and closed ranges", () => {
    expect(parseByteRange("bytes=0-", 1000)).toEqual({ start: 0, end: 999, partial: true });
    expect(parseByteRange("bytes=100-199", 1000)).toEqual({ start: 100, end: 199, partial: true });
    expect(parseByteRange("bytes=-50", 1000)).toEqual({ start: 950, end: 999, partial: true });
    expect(parseByteRange(null, 1000)).toEqual({ start: 0, end: 999, partial: false });
  });
});

describe("guessMime", () => {
  it("prefers a real mime type, then the extension", () => {
    expect(guessMime({ mimeType: "video/mp4", fileName: "a.mkv" })).toBe("video/mp4");
    expect(guessMime({ fileName: "a.webm" })).toBe("video/webm");
  });
});
