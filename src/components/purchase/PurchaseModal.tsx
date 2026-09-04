"use client";

import { useState } from "react";

import { PANEL_CATEGORIES } from "@/lib/categories";
import { MIN_PURCHASE_AMOUNT_CENTS } from "@/lib/economy";

const MIN_AMOUNT_EUROS = MIN_PURCHASE_AMOUNT_CENTS / 100;
const DEFAULT_AMOUNT_EUROS = 20;

interface PurchaseModalProps {
  onClose: () => void;
}

/**
 * "Clic sur un emplacement libre -> modal avec détail + champ montant
 * libre" from the brief. Only collects the amount (+ a few optional
 * fields) — the site URL comes later, after payment confirms (see
 * /panneau/nouveau).
 *
 * Triggered from a plain button rather than clicking a spot in the 3D
 * scene for now: raycasting onto specific empty ground/building slots
 * is a separate, sizeable piece of interaction work — see README.
 */
export function PurchaseModal({ onClose }: PurchaseModalProps) {
  const [amountEuros, setAmountEuros] = useState(String(DEFAULT_AMOUNT_EUROS));
  const [category, setCategory] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [notifyOnOutgrown, setNotifyOnOutgrown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const amountCents = Math.round(parseFloat(amountEuros.replace(",", ".")) * 100);
    if (!Number.isFinite(amountCents) || amountCents < MIN_PURCHASE_AMOUNT_CENTS) {
      setError(`Montant minimum : ${MIN_AMOUNT_EUROS} €`);
      return;
    }
    if (notifyOnOutgrown && !ownerEmail) {
      setError("Une adresse email est nécessaire pour être notifié.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amountCents,
          category: category || undefined,
          ownerEmail: ownerEmail || undefined,
          notifyOnOutgrown,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? "Échec de la création du paiement.");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="purchase-modal-title"
    >
      <div className="w-full max-w-sm rounded border border-white/20 bg-[#14161a] p-5 font-mono text-sm text-white/90 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="purchase-modal-title" className="text-base font-semibold text-white">
            Réserver un panneau
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/50 transition-colors hover:text-white"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-white/60">Montant (€) — la taille du panneau en dépend</span>
            <input
              type="text"
              inputMode="decimal"
              value={amountEuros}
              onChange={(event) => setAmountEuros(event.target.value)}
              className="w-full rounded border border-white/20 bg-black/40 px-2 py-1.5 text-white outline-none focus:border-white/50"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-white/60">Catégorie</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-full rounded border border-white/20 bg-black/40 px-2 py-1.5 text-white outline-none focus:border-white/50"
            >
              <option value="">—</option>
              {PANEL_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-white/60">Email (optionnel)</span>
            <input
              type="email"
              value={ownerEmail}
              onChange={(event) => setOwnerEmail(event.target.value)}
              placeholder="vous@exemple.com"
              className="w-full rounded border border-white/20 bg-black/40 px-2 py-1.5 text-white outline-none focus:border-white/50"
            />
          </label>

          <label className="flex items-center gap-2 text-white/60">
            <input
              type="checkbox"
              checked={notifyOnOutgrown}
              onChange={(event) => setNotifyOnOutgrown(event.target.checked)}
            />
            M&rsquo;avertir par email si mon panneau se fait dépasser
          </label>

          {error ? <p className="text-red-400">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-white py-2 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Redirection…" : "Payer et réserver"}
          </button>
        </form>
      </div>
    </div>
  );
}
