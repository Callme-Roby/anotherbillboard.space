import { Suspense } from "react";

import { ClaimForm } from "@/components/purchase/ClaimForm";

export default function NouveauPanneauPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-black p-4">
      <Suspense fallback={<p className="font-mono text-sm text-white/60">Chargement…</p>}>
        <ClaimForm />
      </Suspense>
    </main>
  );
}
