const ENTRIES = [
  { control: "Molette/pincement", action: "Zoom", essential: true },
  { control: "Réserver un panneau", action: "Bouton en bas de l'écran", essential: false },
  { control: "Panneau occupé", action: "Bientôt cliquable (visite du site)", essential: false },
];

/**
 * Static HUD panel, bottom-right, listing the scene's interactions (mouse
 * and touch alike). Only the zoom hint shows below `sm` — the other two
 * entries are self-evident (a labeled button) or describe a not-yet-built
 * interaction — so the box stays short enough to clear the raised
 * PurchaseTrigger button above it on a narrow phone (see that component's
 * doc comment). Full list returns from `sm:` up, where there's both more
 * width to wrap into and more vertical room below the button.
 */
export function Legend() {
  return (
    <div
      className="pointer-events-none fixed bottom-[calc(1rem+var(--safe-bottom))] right-[calc(1rem+var(--safe-right))] max-w-[170px] rounded border border-white/20 bg-black/30 p-2.5 font-mono text-[11px] leading-snug text-white/80 backdrop-blur-sm sm:max-w-[220px] sm:p-3 sm:text-xs"
    >
      <p className="mb-1.5 font-semibold text-white">Légende</p>
      <ul className="space-y-1">
        {ENTRIES.map((entry) => (
          <li key={entry.control} className={entry.essential ? undefined : "hidden sm:block"}>
            <span className="text-white">{entry.control}</span> — {entry.action}
          </li>
        ))}
      </ul>
    </div>
  );
}
