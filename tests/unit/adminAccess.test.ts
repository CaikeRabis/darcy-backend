import { describe, expect, it } from 'vitest'
import { getConfiguredAdminProfileIds, isAdminProfileId } from '../../src/config/adminAccess'

const ADMIN_ID = '11111111-1111-4111-8111-111111111111'

describe('admin access allowlist', () => {
  it('denies by default and ignores emails or malformed values', () => {
    expect(getConfiguredAdminProfileIds({})).toEqual(new Set())
    expect(isAdminProfileId(ADMIN_ID, { DARCY_ADMIN_PROFILE_IDS: 'admin@example.com,not-a-uuid' })).toBe(false)
  })

  it('authorizes only an explicitly configured profile UUID', () => {
    expect(isAdminProfileId(ADMIN_ID, { DARCY_ADMIN_PROFILE_IDS: ` ${ADMIN_ID} ` })).toBe(true)
    expect(isAdminProfileId('22222222-2222-4222-8222-222222222222', { DARCY_ADMIN_PROFILE_IDS: ADMIN_ID })).toBe(false)
  })
})
