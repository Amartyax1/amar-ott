import Image from "next/image";
import { hueFor } from "@/lib/format";
import { cn } from "@/lib/utils";

type ArtworkProps = {
  name: string;
  kind: "movie" | "show";
  year?: number | null;
  src?: string | null;
  variant: "poster" | "backdrop";
  className?: string;
  priority?: boolean;
  sizes?: string;
};

/** Real TMDB artwork when available, otherwise a generated gradient card so the grid never looks broken. */
export function Artwork({ name, kind, year, src, variant, className, priority, sizes }: ArtworkProps) {
  if (src) {
    return (
      <div className={cn("relative overflow-hidden bg-muted", className)}>
        <Image
          src={src}
          alt={name}
          fill
          priority={priority}
          sizes={sizes ?? (variant === "poster" ? "(max-width: 640px) 40vw, 200px" : "100vw")}
          className="object-cover"
        />
      </div>
    );
  }

  const hue = hueFor(name);
  const background = `radial-gradient(120% 90% at 15% 10%, oklch(0.55 0.16 ${hue}) 0%, transparent 60%),
    radial-gradient(100% 80% at 90% 100%, oklch(0.42 0.14 ${(hue + 70) % 360}) 0%, transparent 65%),
    linear-gradient(160deg, oklch(0.28 0.06 ${hue}) 0%, oklch(0.16 0.03 ${(hue + 40) % 360}) 100%)`;

  if (variant === "backdrop") {
    return <div aria-hidden className={cn("relative overflow-hidden", className)} style={{ background }} />;
  }

  return (
    <div
      role="img"
      aria-label={name}
      className={cn("relative flex flex-col justify-between overflow-hidden p-3", className)}
      style={{ background }}
    >
      <span className="text-[10px] font-semibold tracking-[0.2em] text-white/60 uppercase">
        {kind === "show" ? "Series" : "Film"}
      </span>
      <div>
        <p className="line-clamp-4 text-lg leading-tight font-extrabold tracking-tight text-balance text-white drop-shadow-sm sm:text-xl">
          {name}
        </p>
        {year ? <p className="mt-1 text-xs font-medium text-white/70">{year}</p> : null}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent_0_2px,rgba(255,255,255,0.025)_2px_3px)]" />
    </div>
  );
}
