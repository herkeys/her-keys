/**
 * Purchase readiness: can Her Keys honestly show a purchase sheet right now?
 *
 * The paywall is only worth presenting when RevenueCat resolved the current offering to real, priced store packages. An offering
 * with no packages (a store product that is not registered or not yet available to this store account) would render an empty or
 * broken sheet, so it is reported as unavailable instead. Prices are never read here for display: the RevenueCat paywall renders
 * the store's own localized price strings; this only checks that they exist.
 *
 * Structural types on purpose: nothing outside `revenueCatClient.ts` imports the SDK.
 */
export interface OfferingPackageLike {
  identifier: string;
  packageType?: string;
  product: { identifier: string; priceString: string };
}

export interface OfferingLike {
  identifier: string;
  availablePackages: readonly OfferingPackageLike[];
}

export type OfferingAssessment =
  | { ready: false; reason: 'no_offering' | 'no_packages' | 'unpriced' }
  | { ready: true; monthly: boolean; annual: boolean; packages: number };

export function assessOffering(offering: OfferingLike | null | undefined): OfferingAssessment {
  if (!offering) return { ready: false, reason: 'no_offering' };
  const packages = offering.availablePackages ?? [];
  if (packages.length === 0) return { ready: false, reason: 'no_packages' };
  const priced = packages.filter((pkg) => pkg.product?.identifier && pkg.product.priceString?.trim());
  if (priced.length === 0) return { ready: false, reason: 'unpriced' };
  return {
    ready: true,
    monthly: priced.some((pkg) => pkg.packageType === 'MONTHLY' || pkg.identifier === '$rc_monthly'),
    annual: priced.some((pkg) => pkg.packageType === 'ANNUAL' || pkg.identifier === '$rc_annual'),
    packages: priced.length,
  };
}
