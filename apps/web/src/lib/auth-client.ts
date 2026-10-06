import { twoFactorClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

// Kept for the deferred MFA restoration path; local screens never expose enrollment.
export const authClient = createAuthClient({ plugins: [twoFactorClient()] })
