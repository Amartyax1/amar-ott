import type { DB } from "./index";
import { titleKey } from "@/lib/parse";

type DemoMovie = { name: string; year: number; genres: string[]; rating: number; overview: string; minutes: number };
type DemoShow = Omit<DemoMovie, "minutes"> & { seasons: string[][] };

// Fictional titles so the UI can be explored before any real uploads exist.
const MOVIES: DemoMovie[] = [
  { name: "The Last Lighthouse", year: 2023, genres: ["Drama", "Mystery"], rating: 7.9, minutes: 118, overview: "A retired keeper returns to the storm-battered island where his brother vanished thirty winters ago, and finds the lamp still burning." },
  { name: "Neon Monsoon", year: 2024, genres: ["Action", "Thriller"], rating: 7.2, minutes: 131, overview: "When the rains flood a megacity for forty days, a courier with a stolen drive has one night to cross it before the water, and the syndicate, catch up." },
  { name: "Paper Moons", year: 2021, genres: ["Romance", "Comedy"], rating: 7.0, minutes: 102, overview: "Two rival stationery-shop owners on the same narrow street discover they've been secretly exchanging letters for a year." },
  { name: "Orbit of Ash", year: 2022, genres: ["Science Fiction", "Thriller"], rating: 7.6, minutes: 124, overview: "The last crew of a mining station above a dying volcanic moon must decide who boards the only shuttle home." },
  { name: "Small Hours", year: 2020, genres: ["Drama"], rating: 7.4, minutes: 96, overview: "A night-shift pharmacist and a sleepless teenager form an unlikely friendship over the counter between 2 and 5 a.m." },
  { name: "The Cartographer's Daughter", year: 2019, genres: ["Adventure", "Drama"], rating: 7.8, minutes: 139, overview: "Armed with her late father's unfinished maps, a young surveyor sets out to chart a valley that no two maps agree on." },
  { name: "Midnight Masala", year: 2023, genres: ["Comedy", "Drama"], rating: 7.1, minutes: 112, overview: "A washed-up celebrity chef opens a late-night street stall and accidentally becomes the most talked-about kitchen in the city." },
  { name: "Cold Signal", year: 2024, genres: ["Science Fiction", "Mystery"], rating: 7.5, minutes: 108, overview: "An Antarctic radio operator starts receiving transmissions in her own voice, dated six days in the future." },
  { name: "Wild Hearts Run", year: 2018, genres: ["Adventure", "Romance"], rating: 6.8, minutes: 115, overview: "Two strangers entered in a thousand-kilometre horse race across the steppe learn the finish line matters less than the ride." },
  { name: "The Quiet Heist", year: 2022, genres: ["Crime", "Thriller", "Comedy"], rating: 7.3, minutes: 106, overview: "A crew of retired librarians plan the gentlest bank robbery in history: no weapons, no noise, and absolutely no overdue fines." },
  { name: "Ember & Oak", year: 2021, genres: ["Animation", "Family", "Adventure"], rating: 8.1, minutes: 94, overview: "A spark from a campfire and an ancient oak tree team up to save their forest from a summer that won't end." },
  { name: "Tidewater", year: 2024, genres: ["Mystery", "Drama", "Thriller"], rating: 7.7, minutes: 121, overview: "When the tide reveals a car that sank fifty years ago, a small coastal town's oldest secret comes up with it." },
];

const SHOWS: DemoShow[] = [
  {
    name: "Hollow Creek", year: 2022, genres: ["Mystery", "Drama"], rating: 8.3,
    overview: "Every autumn someone in Hollow Creek forgets a year of their life. This year, it's the sheriff.",
    seasons: [
      ["The Missing Year", "Leaf Fall", "Cold Case", "The Orchard", "Under the Bridge", "First Frost"],
      ["Thaw", "The Letter", "Old Roads", "Witness", "Midwinter", "Hollow"],
    ],
  },
  {
    name: "Night Shift Diaries", year: 2021, genres: ["Comedy"], rating: 7.6,
    overview: "The overnight staff of a 24-hour laundromat handle lost socks, lost souls and one very persistent raccoon.",
    seasons: [["Spin Cycle", "Delicates", "Lint Trap", "Permanent Press", "Bleach", "Tumble Dry", "Lost Sock", "Fold"]],
  },
  {
    name: "Starbound", year: 2023, genres: ["Science Fiction", "Adventure"], rating: 8.0,
    overview: "A generation ship's first crew born in deep space discovers the destination planet has already been claimed.",
    seasons: [
      ["Launch Day", "Drift", "The Garden Deck", "Quarantine", "Signal", "Mutiny", "Slingshot", "Landfall"],
      ["Claimed", "Envoys", "The Other Ship", "Homeworld"],
    ],
  },
  {
    name: "The Syndicate Files", year: 2020, genres: ["Crime", "Thriller", "Drama"], rating: 7.9,
    overview: "An accountant turned informant keeps a ledger of every favour the city's most powerful family owes.",
    seasons: [["Ledger", "Interest", "Collateral", "Audit", "Default", "Balance"]],
  },
];

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function seedDemo(db: DB) {
  const sqlite = db.$client;
  const seed = sqlite.transaction(() => {
    const { n } = sqlite.prepare("SELECT COUNT(*) AS n FROM titles").get() as { n: number };
    if (n > 0) return;

    const insertTitle = sqlite.prepare(
      `INSERT INTO titles (kind, key, name, year, overview, genres, rating, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    );
    const insertEpisode = sqlite.prepare(
      "INSERT INTO episodes (title_id, season, episode, name) VALUES (?, ?, ?, ?) RETURNING id",
    );
    const insertFile = sqlite.prepare(
      `INSERT INTO files (title_id, episode_id, telegram_file_id, telegram_file_unique_id, media_type, file_name,
         mime_type, size, duration, width, height, vault_chat_id, vault_message_id, caption, created_at)
       VALUES (?, ?, ?, ?, 'video', ?, 'video/mp4', ?, ?, 1920, 1080, 0, ?, ?, ?)`,
    );

    let msgId = 1;
    const base = Date.now() - 1000 * 60 * 60 * 24 * 40;
    const all = [...MOVIES.map((m) => ({ ...m, kind: "movie" as const })), ...SHOWS.map((s) => ({ ...s, kind: "show" as const }))];
    // Interleave so "Recently added" mixes movies and shows.
    all.sort((a, b) => hash(a.name) - hash(b.name));

    all.forEach((t, i) => {
      const at = base + i * 1000 * 60 * 60 * 60;
      const key = titleKey(t.name, t.kind === "movie" ? t.year : null);
      const { id } = insertTitle.get(t.kind, key, t.name, t.year, t.overview, JSON.stringify(t.genres), t.rating, at, at) as { id: number };
      const slug = t.name.replace(/[^a-z0-9]+/gi, ".");

      if (t.kind === "movie") {
        const fileName = `${slug}.${t.year}.1080p.WEB-DL.mp4`;
        const size = 1_400_000_000 + (hash(t.name) % 1_600_000_000);
        insertFile.run(id, null, `demo_${msgId}`, `demo_u_${msgId}`, fileName, size, t.minutes * 60, msgId, `${t.name} (${t.year})`, at);
        msgId++;
        return;
      }
      t.seasons.forEach((names, s) =>
        names.forEach((epName, e) => {
          const { id: epId } = insertEpisode.get(id, s + 1, e + 1, epName) as { id: number };
          const code = `S${String(s + 1).padStart(2, "0")}E${String(e + 1).padStart(2, "0")}`;
          const size = 350_000_000 + (hash(`${t.name}${code}`) % 500_000_000);
          const minutes = 42 + (hash(code + t.name) % 16);
          insertFile.run(id, epId, `demo_${msgId}`, `demo_u_${msgId}`, `${slug}.${code}.1080p.mp4`, size, minutes * 60, msgId, `${t.name} ${code} - ${epName}`, at + msgId * 1000);
          msgId++;
        }),
      );
    });
  });
  seed.immediate();
}
