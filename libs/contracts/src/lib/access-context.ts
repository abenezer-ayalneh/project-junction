import { z } from 'zod'

const IdentifierSchema = z.string().uuid()

export const CapabilitySchema = z.enum(['platform:foundation:read', 'platform:foundation:write', 'platform:vendor:review', 'platform:finance:configure'])

export const MembershipSchema = z.object({
	vendorId: IdentifierSchema,
	role: z.enum(['vendor_owner', 'vendor_staff']),
	locationIds: z.array(IdentifierSchema),
	active: z.boolean(),
	goodsFulfillmentEnabled: z.boolean().default(false),
})

export const AccessContextSchema = z.object({
	actor: z.object({ kind: z.literal('user'), userId: IdentifierSchema }),
	workspaceId: IdentifierSchema,
	activeVendorId: IdentifierSchema.nullable(),
	locationIds: z.array(IdentifierSchema),
	memberships: z.array(MembershipSchema),
	capabilities: z.array(CapabilitySchema),
	goodsOrderAuthorities: z.array(z.object({ orderId: IdentifierSchema, permission: z.literal('cancel'), expiresAt: z.string().datetime() })).default([]),
	session: z.object({
		id: IdentifierSchema,
		expiresAt: z.string().datetime(),
		revokedAt: z.string().datetime().nullable(),
		mfaVerifiedAt: z.string().datetime().nullable(),
		recentAuthAt: z.string().datetime().nullable(),
	}),
})

export type AccessContext = z.infer<typeof AccessContextSchema>
export type Capability = z.infer<typeof CapabilitySchema>

export const OwnershipScopeSchema = z.object({
	workspaceId: IdentifierSchema,
	vendorId: IdentifierSchema.optional(),
	locationId: IdentifierSchema.optional(),
})

export type OwnershipScope = z.infer<typeof OwnershipScopeSchema>
