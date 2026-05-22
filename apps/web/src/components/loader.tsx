import { Loader2 } from "lucide-react";

export default function Loader() {
  return (
    <div className="flex h-full min-h-[240px] items-center justify-center bg-background text-[#B43C39]" role="status" aria-label="Loading page">
      <Loader2 className="size-8 animate-spin" />
    </div>
  );
}
