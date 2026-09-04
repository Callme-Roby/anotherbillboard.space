"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import type { PublicPanel } from "@/lib/api/serializePanel";

type Status = "idle" | "loading" | "success" | "error";

const CARD_CLASSES =
  "w-full max-w-md rounded border border-white/20 bg-[#14161a] p-6 font-mono text-white/90 shadow-xl";

/**
 * Lands here from Stripe's success_url (`?session_id={CHECKOUT_SESSION_ID}`)
 * — the "l'utilisateur renseigne l'URL de son site" step from the brief,
 * which happens after payment confirms rather than in the purchase modal.
 * Submits to POST /api/panels/claim, which scrapes the URL, places, and
 * broadcasts the panel.
 */
export function ClaimForm() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<PublicPanel | null>(null);

  if (!sessionId) {
    return (
      <div className={CARD_CLASSES}>
        <p>Lien invalide — aucune session de paiement trouvée.</p>
        <Link href="/" className="mt-4 inline-block text-white underline">
          Retour à la scène
        </Link>
      </div>
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("loading");
    setError(null);

    try {
      const response = await fetch("/api/panels/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, url }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Échec de la validation du panneau.");
      }
      setPanel(data.panel as PublicPanel);
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setStatus("error");
    }
  }

  if (status === "success" && panel) {
    return (
      <div className={CARD_CLASSES}>
        <p className="mb-4 text-base text-white">Votre panneau est en ligne 🎉</p>
        <p className="mb-4 text-sm text-white/60">{panel.title || panel.url}</p>
        <Link
          href="/"
          className="inline-block rounded bg-white px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90"
        >
          Voir la scène
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`${CARD_CLASSES} space-y-4`}>
      <div>
        <h1 className="text-base font-semibold text-white">Paiement confirmé ✓</h1>
        <p className="mt-1 text-sm text-white/60">Dernière étape : l&rsquo;URL de votre site.</p>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm text-white/60">URL de votre site</span>
        <input
          type="url"
          required
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://votresite.com"
          className="w-full rounded border border-white/20 bg-black/40 px-2 py-1.5 text-sm text-white outline-none focus:border-white/50"
        />
      </label>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded bg-white py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {status === "loading" ? "Validation…" : "Valider mon panneau"}
      </button>
    </form>
  );
}
