import { z } from 'zod'

export const DomainEventSchema = z.object({
	eventId: z.string().uuid(),
	type: z.enum([
		'FoundationCommandAccepted',
		'ProviderCallbackReceived',
		'ProviderTimeoutReconciled',
		'VendorApplicationSubmitted',
		'VendorApplicationReviewed',
		'ListingSubmittedForReview',
		'ListingRevised',
		'ListingPublished',
		'ListingUnpublished',
		'StorefrontUpdated',
		'MediaQuarantined',
		'MediaProcessed',
		'MediaRejected',
		'MediaReviewed',
		'CatalogImportCommitted',
		'StockMoved',
	]),
	aggregateId: z.string().uuid(),
	aggregateVersion: z.number().int().positive(),
	workspaceId: z.string().uuid(),
	causationId: z.string().uuid(),
	correlationId: z.string().uuid(),
	idempotencyKey: z.string().nullable(),
	occurredAt: z.string().datetime(),
	schemaVersion: z.literal(1),
	payload: z.record(z.string(), z.unknown()),
})

export type DomainEvent = z.infer<typeof DomainEventSchema>
