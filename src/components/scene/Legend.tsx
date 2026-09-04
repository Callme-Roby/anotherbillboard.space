const ENTRIES = [
  { control: "Molette", action: "Zoom avant / arrière" },
  { control: "Réserver un panneau", action: "Bouton en bas de l'écran" },
  { control: "Panneau occupé", action: "Bientôt cliquable (visite du site)" },
];

/** Static HUD panel, bottom-right, listing the scene's interactions. */
export function Legend() {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 max-w-xs rounded border border-white/20 bg-black/30 p-3 font-mono text-xs text-white/80 backdrop-blur-sm">
      <p className="mb-1.5 font-semibold text-white">Légende</p>
      <ul className="space-y-1">
        {ENTRIES.map((entry) => (
          <li key={entry.control}>
            <span className="text-white">{entry.control}</span> — {entry.action}
          </li>
        ))}
      </ul>
    </div>
  );
}
