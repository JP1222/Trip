/** Soft branding for this deployment. Domain code stays "trip". */
export function getSiteName(): string {
  const name = process.env.SITE_NAME?.trim();
  return name || "Peng";
}

export function getSiteTagline(): string {
  const tagline = process.env.SITE_TAGLINE?.trim();
  return tagline || "Travel notes, photos, and writing.";
}
