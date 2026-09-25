import Link from "next/link";
import { Film } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";

export default function TitleNotFound() {
  return (
    <div className="pt-24">
      <EmptyState
        icon={Film}
        title="This title isn't in the vault"
        action={
          <Link href="/" className={buttonVariants()}>
            Back to home
          </Link>
        }
      >
        It may have been removed by the owner, or the link is wrong.
      </EmptyState>
    </div>
  );
}
