import { describe, expect, it } from "vitest";
import { isVideoFile, parseMedia, titleKey } from "./parse";

describe("parseMedia: movies", () => {
  it.each([
    ["Inception (2010)", null, { title: "Inception", year: 2010 }],
    [null, "Inception.2010.1080p.BluRay.x264-YTS.mkv", { title: "Inception", year: 2010 }],
    [null, "Blade.Runner.2049.2017.2160p.WEB-DL.mkv", { title: "Blade Runner 2049", year: 2017 }],
    ["2012 (2009)", null, { title: "2012", year: 2009 }],
    [null, "2012.mkv", { title: "2012", year: null }],
    [null, "the_grand_budapest_hotel_[2014]_720p.mp4", { title: "The Grand Budapest Hotel", year: 2014 }],
    ["Spirited Away", null, { title: "Spirited Away", year: null }],
    [null, "[Group] Your Name (2016) [1080p].mkv", { title: "Your Name", year: 2016 }],
  ])("%s / %s", (caption, file, expected) => {
    expect(parseMedia(caption, file)).toEqual({ kind: "movie", ...expected });
  });
});

describe("parseMedia: episodes", () => {
  it("parses SxxExx release names", () => {
    expect(parseMedia(null, "The.Office.US.S02E05.720p.WEB.mkv")).toEqual({
      kind: "episode",
      show: "The Office US",
      year: null,
      season: 2,
      episode: 5,
      episodeTitle: null,
    });
  });

  it("parses captions with an episode title", () => {
    expect(parseMedia("Dark S01E02 - Lies", null)).toMatchObject({
      show: "Dark",
      season: 1,
      episode: 2,
      episodeTitle: "Lies",
    });
  });

  it("parses 1x02 and 'Season 1 Episode 2' styles", () => {
    expect(parseMedia(null, "Friends 1x02.mp4")).toMatchObject({ show: "Friends", season: 1, episode: 2 });
    expect(parseMedia("Breaking Bad Season 3 Episode 7", null)).toMatchObject({
      show: "Breaking Bad",
      season: 3,
      episode: 7,
    });
  });

  it("keeps the show year and ignores double-episode suffixes", () => {
    expect(parseMedia(null, "Doctor.Who.2005.S01E01-E02.Rose.1080p.mkv")).toMatchObject({
      show: "Doctor Who",
      year: 2005,
      season: 1,
      episode: 1,
      episodeTitle: "Rose",
    });
  });

  it("prefers the caption but falls back to the file name", () => {
    expect(parseMedia("", "Severance.S01E03.mkv")).toMatchObject({ show: "Severance", episode: 3 });
    expect(parseMedia("Severance S02E01", "random.mkv")).toMatchObject({ season: 2, episode: 1 });
  });
});

describe("helpers", () => {
  it("builds stable keys", () => {
    expect(titleKey("The Office!")).toBe(titleKey("the office"));
    expect(titleKey("Amélie", 2001)).toBe("amelie 2001");
  });

  it("detects video files", () => {
    expect(isVideoFile("a.mkv", null)).toBe(true);
    expect(isVideoFile("a.pdf", "video/mp4")).toBe(true);
    expect(isVideoFile("a.pdf", "application/pdf")).toBe(false);
  });

  it("returns null for empty input", () => {
    expect(parseMedia(null, null)).toBeNull();
  });
});
