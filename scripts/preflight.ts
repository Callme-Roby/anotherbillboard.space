/**
 * `npm run preflight` — vérifie, une fois `.env.local` (ou les variables
 * Vercel) renseignées, que chaque étape de « Mise en ligne » a bien pris.
 *
 * La chaîne de paiement ne se teste pas en la regardant : une clé du
 * mauvais mode, des tables créées mais non peuplées, ou une clé Pusher
 * publique qui ne correspond pas à celle du serveur ne se voient qu'au
 * moment où un vrai paiement échoue. Ce script fait les appels qui
 * répondent à ces questions, et dit quoi faire pour chaque échec.
 *
 * Ne remplace pas `npm test` (qui exerce la logique hors-ligne) : ici on
 * ne vérifie que la configuration et l'accès aux services.
 */
import { loadEnvConfig } from "@next/env";

// Avant tout import de `@/lib/db/client` ou `@/lib/stripe/client` : ces
// modules lisent l'environnement au chargement. Les imports étant
// hissés, les leurs se font dynamiquement plus bas — même raison que
// dans src/lib/db/seed.ts.
loadEnvConfig(process.cwd());

interface Check {
  /** Ce qui est vérifié, tel qu'affiché. */
  label: string;
  /** Faux = le site ne peut pas fonctionner ; vrai = dégradation propre. */
  optional?: boolean;
  run: () => Promise<Outcome>;
}

type Outcome =
  | { status: "ok"; detail: string }
  | { status: "skip"; detail: string }
  | { status: "fail"; detail: string; fix: string };

const checks: Check[] = [
  {
    label: "Base de données (Neon)",
    run: async () => {
      if (!process.env.DATABASE_URL) {
        return {
          status: "fail",
          detail: "DATABASE_URL absente",
          fix: "Étape 1 : créer le projet sur neon.tech et coller la chaîne de connexion dans .env.local.",
        };
      }

      const [{ db }, { buildings, panels }] = await Promise.all([
        import("../src/lib/db/client"),
        import("../src/lib/db/schema"),
      ]);

      let seeded: number;
      try {
        // Interroger les deux tables *est* le test de leur existence :
        // une table manquante remonte en erreur Postgres explicite.
        seeded = (await db.select({ id: buildings.id }).from(buildings)).length;
        await db.select({ id: panels.id }).from(panels).limit(1);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const missingTable = /relation .* does not exist/i.test(message);
        return {
          status: "fail",
          detail: missingTable ? "connectée, mais les tables n'existent pas" : message,
          fix: missingTable
            ? "Étape 2 : npm run db:push"
            : "Vérifier que la chaîne de connexion est complète (elle finit par ?sslmode=require) et que le projet Neon n'est pas en veille.",
        };
      }

      if (seeded === 0) {
        return {
          status: "fail",
          detail: "tables créées, mais `buildings` est vide",
          fix: "Étape 2 : npm run db:seed",
        };
      }

      return { status: "ok", detail: `connectée, ${seeded} bâtiments en base` };
    },
  },

  {
    label: "Stripe — clé secrète",
    run: async () => {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) {
        return {
          status: "fail",
          detail: "STRIPE_SECRET_KEY absente",
          fix: "Étape 3 : Stripe -> Developers -> API keys -> Secret key.",
        };
      }
      if (!/^(sk|rk)_(test|live)_/.test(key)) {
        return {
          status: "fail",
          detail: "ne ressemble pas à une clé secrète",
          fix: "Une clé secrète commence par sk_test_ ou sk_live_ — pk_ est la clé *publiable*, qui ne sert pas ici.",
        };
      }

      const { getStripe } = await import("../src/lib/stripe/client");
      try {
        // Appel le moins cher qui prouve à la fois que la clé est
        // acceptée et dans quel mode elle est.
        const balance = await getStripe().balance.retrieve();
        return {
          status: "ok",
          detail: balance.livemode ? "valide — compte en mode RÉEL (paiements réels)" : "valide — mode test",
        };
      } catch (error) {
        return {
          status: "fail",
          detail: error instanceof Error ? error.message : String(error),
          fix: "Soit la clé est fausse ou révoquée, soit api.stripe.com n'est pas joignable depuis cette machine — les deux donnent une erreur ici.",
        };
      }
    },
  },

  {
    label: "Stripe — secret de webhook",
    run: async () => {
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!secret) {
        return {
          status: "fail",
          detail: "STRIPE_WEBHOOK_SECRET absent",
          fix: "En local : `stripe listen --forward-to localhost:3000/api/webhooks/stripe` l'affiche (étape 5). En production : le signing secret de l'endpoint créé à l'étape 7.",
        };
      }
      if (!secret.startsWith("whsec_")) {
        return {
          status: "fail",
          detail: "ne ressemble pas à un signing secret",
          fix: "Un signing secret commence par whsec_.",
        };
      }
      // Il n'existe aucun appel API qui valide un signing secret : le
      // seul verdict est une vraie livraison. Le nôtre est propre à
      // chaque endpoint — celui du CLI n'est pas celui de production.
      return { status: "ok", detail: "présent (validable seulement par une vraie livraison)" };
    },
  },

  {
    label: "Pusher (temps réel)",
    optional: true,
    run: async () => {
      const vars = {
        PUSHER_APP_ID: process.env.PUSHER_APP_ID,
        PUSHER_KEY: process.env.PUSHER_KEY,
        PUSHER_SECRET: process.env.PUSHER_SECRET,
        PUSHER_CLUSTER: process.env.PUSHER_CLUSTER,
        NEXT_PUBLIC_PUSHER_KEY: process.env.NEXT_PUBLIC_PUSHER_KEY,
        NEXT_PUBLIC_PUSHER_CLUSTER: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
      };
      const missing = Object.entries(vars)
        .filter(([, value]) => !value)
        .map(([name]) => name);

      if (missing.length === Object.keys(vars).length) {
        return { status: "skip", detail: "non configuré — la scène se rafraîchit alors au chargement seulement" };
      }
      if (missing.length > 0) {
        return {
          status: "fail",
          detail: `configuration partielle, il manque ${missing.join(", ")}`,
          fix: "Les six variables vont ensemble : à moitié configuré, la diffusion échoue en silence.",
        };
      }
      // La panne la plus coûteuse de cette intégration : le serveur
      // publie sur une app, le client écoute l'autre, et rien n'erreure
      // nulle part. Seule une comparaison la détecte.
      if (vars.NEXT_PUBLIC_PUSHER_KEY !== vars.PUSHER_KEY) {
        return {
          status: "fail",
          detail: "NEXT_PUBLIC_PUSHER_KEY ≠ PUSHER_KEY",
          fix: "Les deux doivent être la *même* app key : le client écouterait une autre app que celle où le serveur publie, sans aucune erreur visible.",
        };
      }
      if (vars.NEXT_PUBLIC_PUSHER_CLUSTER !== vars.PUSHER_CLUSTER) {
        return {
          status: "fail",
          detail: "NEXT_PUBLIC_PUSHER_CLUSTER ≠ PUSHER_CLUSTER",
          fix: "Même cluster des deux côtés (eu, mt1, …).",
        };
      }

      // Pas via `broadcastToPlaza` : il avale ses erreurs par dessein
      // (une diffusion ratée ne doit jamais faire échouer un paiement),
      // donc il rapporterait un succès avec un secret faux. Et sur un
      // canal à part : le canal réel a de vrais visiteurs dessus.
      const { default: PusherServer } = await import("pusher");
      const pusher = new PusherServer({
        appId: vars.PUSHER_APP_ID as string,
        key: vars.PUSHER_KEY as string,
        secret: vars.PUSHER_SECRET as string,
        cluster: vars.PUSHER_CLUSTER as string,
        useTLS: true,
      });
      try {
        await pusher.trigger("preflight", "check", { at: new Date().toISOString() });
      } catch (error) {
        return {
          status: "fail",
          detail: error instanceof Error ? error.message : String(error),
          fix: "Identifiants refusés par Pusher : recopier app id, key, secret et cluster depuis l'app Channels.",
        };
      }
      return { status: "ok", detail: "identifiants acceptés, événement de test publié" };
    },
  },

  {
    label: "Resend (email)",
    optional: true,
    run: async () => {
      const key = process.env.RESEND_API_KEY;
      const from = process.env.RESEND_FROM_EMAIL;
      if (!key && !from) {
        return { status: "skip", detail: "non configuré — aucun email « votre panneau a été dépassé » ne partira" };
      }
      if (!key || !from) {
        return {
          status: "fail",
          detail: `il manque ${key ? "RESEND_FROM_EMAIL" : "RESEND_API_KEY"}`,
          fix: "Les deux sont nécessaires : la clé pour l'envoi, l'adresse pour l'expéditeur.",
        };
      }
      if (!from.includes("@")) {
        return {
          status: "fail",
          detail: "RESEND_FROM_EMAIL n'est pas une adresse",
          fix: "Une adresse sur un domaine vérifié dans Resend, par exemple contact@anotherbillboard.space.",
        };
      }
      return { status: "ok", detail: `configuré, expéditeur ${from}` };
    },
  },
];

async function main(): Promise<void> {
  console.log("\nVérification de la configuration\n");

  let blocking = 0;
  for (const check of checks) {
    const outcome = await check.run().catch(
      (error): Outcome => ({
        status: "fail",
        detail: error instanceof Error ? error.message : String(error),
        fix: "Erreur inattendue pendant la vérification.",
      }),
    );

    const failed = outcome.status === "fail";
    const symbol = failed ? (check.optional ? "!" : "x") : outcome.status === "skip" ? "-" : "✓";
    console.log(`  ${symbol}  ${check.label} : ${outcome.detail}`);
    if (outcome.status === "fail") {
      console.log(`     -> ${outcome.fix}`);
      if (!check.optional) blocking++;
    }
  }

  if (blocking > 0) {
    console.log(`\n${blocking} point(s) bloquant(s) — le tunnel d'achat ne peut pas fonctionner en l'état.\n`);
    process.exit(1);
  }
  console.log("\nRien de bloquant : le tunnel d'achat a tout ce qu'il lui faut.\n");
}

void main();
