const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Administrative access is an explicit server-side allowlist of profile UUIDs.
 * It is intentionally empty unless configured; emails and user metadata are not
 * authorization sources.
 */
export function getConfiguredAdminProfileIds(environment: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(
    (environment.DARCY_ADMIN_PROFILE_IDS ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => UUID.test(value)),
  )
}

export function isAdminProfileId(profileId: string, environment: NodeJS.ProcessEnv = process.env): boolean {
  return getConfiguredAdminProfileIds(environment).has(profileId.toLowerCase())
}
