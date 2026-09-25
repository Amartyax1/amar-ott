import { Suspense } from "react";
import { MobileNav } from "@/components/mobile-nav";
import { SiteHeader } from "@/components/site-header";
import { isMock } from "@/lib/env";
import { requireUser } from "@/lib/session";

export default async function CatalogLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return (
    <>
      <Suspense>
        <SiteHeader user={{ firstName: user.firstName, username: user.username }} />
      </Suspense>
      <main className="flex-1 pb-24 md:pb-12">{children}</main>
      <footer className="hidden border-t border-white/5 px-12 py-6 text-xs text-muted-foreground md:block">
        {isMock
          ? "Demo mode: no Telegram bot configured. Sends are logged by the bot process instead of delivered."
          : "Pick anything and it lands in your Telegram chat with the bot."}
      </footer>
      <MobileNav />
    </>
  );
}
