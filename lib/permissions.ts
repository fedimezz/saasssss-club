// src/lib/permissions.ts
//
// Fine-grained permission catalog for the ADMIN role. OWNER always has every
// permission — it is not stored in the database and can't be revoked.
// A permission with no row in `role_permissions` is treated as ALLOWED, so
// deploying this feature doesn't silently lock existing Admins out of
// anything until the Owner explicitly flips a switch off.
import prisma from "@/lib/prisma";
import type { JWTPayload } from "@/lib/auth";

export interface PermissionDef {
  key: string;
  label: string;
  group: string;
  description: string;
  /**
   * What an ADMIN gets when the owner has never touched this toggle. Omitted =
   * allowed (keeps every pre-existing capability working after a deploy).
   * `false` is used for capabilities that were OWNER-only before they became
   * delegable, so shipping them does NOT silently widen any ADMIN's access —
   * the owner has to switch them on.
   */
  defaultAllowed?: boolean;
}

export const PERMISSION_CATALOG: PermissionDef[] = [
  { key: "members.write",       group: "Membres",       label: "Ajouter / modifier des membres", description: "Créer et éditer les fiches membres." },
  { key: "members.suspend",     group: "Membres",       label: "Suspendre un membre",             description: "Suspendre ou réactiver un compte membre." },
  { key: "staff.manage",        group: "Équipe",        label: "Gérer l'équipe",                  description: "Voir et gérer les coachs et le staff." },
  { key: "planning.manage",     group: "Planning",      label: "Gérer le planning",               description: "Créer, modifier ou annuler des cours." },
  { key: "bookings.manage",     group: "Réservations",  label: "Gérer les réservations",          description: "Approuver ou annuler des réservations." },
  { key: "memberships.sell",    group: "Abonnements",   label: "Vendre / renouveler",             description: "Vendre et renouveler des abonnements." },
  { key: "payments.record",     group: "Paiements",     label: "Enregistrer des paiements",       description: "Saisir des paiements et imprimer des reçus." },
  { key: "payments.refund",     group: "Paiements",     label: "Rembourser",                      description: "Effectuer des remboursements (réservé normalement à l'Owner)." },
  { key: "announcements.manage",group: "Annonces",      label: "Gérer les annonces",              description: "Publier, modifier ou supprimer des annonces." },
  { key: "notifications.send",  group: "Notifications", label: "Envoyer des notifications",       description: "Notifier les membres manuellement." },
  { key: "reports.view",        group: "Rapports",      label: "Consulter les rapports",          description: "Voir les rapports de fréquentation et paiements." },
  { key: "settings.view",       group: "Club",          label: "Consulter les paramètres",        description: "Voir la configuration du club (lecture seule — seul le propriétaire peut la modifier)." },
  { key: "content.manage",      group: "Site web",      label: "Gérer le contenu du site",        description: "Modifier les textes et photos des pages publiques.", defaultAllowed: false },
  { key: "promotions.manage",   group: "Promotions",    label: "Gérer les promotions",            description: "Créer, modifier et désactiver des codes promo.", defaultAllowed: false },
];

/**
 * Capabilities that can never be delegated: hasPermission() is always false
 * for a non-owner, and they are deliberately absent from PERMISSION_CATALOG so
 * the roles screen offers no toggle for them.
 */
export const OWNER_ONLY_PERMISSIONS: readonly string[] = ["billing.manage"];

export const PERMISSION_KEYS = PERMISSION_CATALOG.map((p) => p.key);

export function isValidPermissionKey(key: string): boolean {
  return PERMISSION_KEYS.includes(key);
}
export function defaultAllowedFor(key: string): boolean {
  return PERMISSION_CATALOG.find((p) => p.key === key)?.defaultAllowed ?? true;
}

export async function hasPermission(user: JWTPayload, key: string): Promise<boolean> {
  if (user.role?.toUpperCase() === "OWNER") return true;
  if (!user.clubId) return false; // SUPER_ADMIN / no gym context — no gym permissions apply
  if (OWNER_ONLY_PERMISSIONS.includes(key)) return false;
  // Unknown keys are denied outright (fail closed) rather than defaulting to allowed.
  if (!isValidPermissionKey(key)) return false;
  const row = await prisma.rolePermission.findUnique({
    where: { clubId_role_key: { clubId: user.clubId, role: "ADMIN", key } },
  });
  return row ? row.allowed : defaultAllowedFor(key);
}

/** True when the user holds at least one of the given permissions. */
export async function hasAnyPermission(user: JWTPayload, keys: string[]): Promise<boolean> {
  for (const key of keys) {
    if (await hasPermission(user, key)) return true;
  }
  return false;
}
