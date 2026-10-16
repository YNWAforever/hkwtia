type CompanyChoice = Readonly<{id: string; canManage: boolean}>;

/** GET defaults are stable; an explicit invalid target never falls back to a different company. */
export function selectPortalCompany<T extends CompanyChoice>(
  companies: readonly T[], requestedId?: unknown,
): {ok: true; company: T | null} | {ok: false} {
  if (requestedId !== undefined) {
    if (typeof requestedId !== "string" || requestedId.length === 0) return {ok: false};
    const company = companies.find((row) => row.id === requestedId);
    return company ? {ok: true, company} : {ok: false};
  }
  const ordered = [...companies].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return {ok: true, company: ordered.find((row) => row.canManage) ?? ordered[0] ?? null};
}

export function portalCompanyPath(path: string, companyId: string): string {
  return `${path}?${new URLSearchParams({companyId})}`;
}
