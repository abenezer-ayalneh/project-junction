import type { INestApplication } from '@nestjs/common'
import { DocumentBuilder, type OpenAPIObject, type SchemaObject, SwaggerModule } from '@nestjs/swagger'
import {
	AccessContextResponseSchema,
	ActiveVendorSelectionResultSchema,
	ActiveVendorSelectionSchema,
	ApiErrorSchema,
	CatalogHealthSchema,
	CatalogImportCommandSchema,
	CatalogImportResultSchema,
	CustomerDiscoveryStateSchema,
	HealthResponseSchema,
	IdentityVerificationSessionSchema,
	IdentityVerificationStatusSchema,
	InventoryAvailabilitySchema,
	InventoryMovementCommandSchema,
	InventoryMovementResultSchema,
	ListingCommandResultSchema,
	ListingDraftSchema,
	ListingReviewCommandSchema,
	ListingRevisionCommandSchema,
	LocationReadSchema,
	MediaAssetSchema,
	MediaPreviewSchema,
	MediaProcessingCommandSchema,
	MediaReviewCommandSchema,
	MediaReviewQueueSchema,
	MediaReviewResultSchema,
	MediaUploadCompleteCommandSchema,
	MediaUploadIntentCommandSchema,
	MediaUploadIntentSchema,
	PlatformReviewQueueSchema,
	PublicListingPageSchema,
	PublicStorefrontSchema,
	PublicVendorPageSchema,
	StorefrontUpdateResultSchema,
	StorefrontUpdateSchema,
	VendorApplicationCommandSchema,
	VendorApplicationResultSchema,
	VendorApplicationReviewResultSchema,
	VendorApplicationReviewSchema,
	VendorCatalogSchema,
	VendorMembershipsSchema,
} from 'contracts'
import { z } from 'zod'

function schemaFor(schema: z.ZodType): SchemaObject {
	const openApiSchema = z.toJSONSchema(schema, { target: 'openapi-3.0' })
	delete openApiSchema.$schema
	return openApiSchema as SchemaObject
}

export const OpenApiSchemaRefs = {
	accessContext: { $ref: '#/components/schemas/AccessContextResponse' },
	activeVendorSelection: { $ref: '#/components/schemas/ActiveVendorSelection' },
	activeVendorSelectionResult: { $ref: '#/components/schemas/ActiveVendorSelectionResult' },
	apiError: { $ref: '#/components/schemas/ApiError' },
	catalogImportCommand: { $ref: '#/components/schemas/CatalogImportCommand' },
	catalogImportResult: { $ref: '#/components/schemas/CatalogImportResult' },
	catalogHealth: { $ref: '#/components/schemas/CatalogHealth' },
	customerDiscoveryState: { $ref: '#/components/schemas/CustomerDiscoveryState' },
	healthResponse: { $ref: '#/components/schemas/HealthResponse' },
	identityVerificationSession: { $ref: '#/components/schemas/IdentityVerificationSession' },
	identityVerificationStatus: { $ref: '#/components/schemas/IdentityVerificationStatus' },
	inventoryAvailability: { $ref: '#/components/schemas/InventoryAvailability' },
	inventoryMovementCommand: { $ref: '#/components/schemas/InventoryMovementCommand' },
	inventoryMovementResult: { $ref: '#/components/schemas/InventoryMovementResult' },
	locationRead: { $ref: '#/components/schemas/LocationRead' },
	listingCommandResult: { $ref: '#/components/schemas/ListingCommandResult' },
	listingDraft: { $ref: '#/components/schemas/ListingDraft' },
	listingRevisionCommand: { $ref: '#/components/schemas/ListingRevisionCommand' },
	listingReviewCommand: { $ref: '#/components/schemas/ListingReviewCommand' },
	mediaAsset: { $ref: '#/components/schemas/MediaAsset' },
	mediaProcessingCommand: { $ref: '#/components/schemas/MediaProcessingCommand' },
	mediaPreview: { $ref: '#/components/schemas/MediaPreview' },
	mediaReviewCommand: { $ref: '#/components/schemas/MediaReviewCommand' },
	mediaReviewQueue: { $ref: '#/components/schemas/MediaReviewQueue' },
	mediaReviewResult: { $ref: '#/components/schemas/MediaReviewResult' },
	mediaUploadCompleteCommand: { $ref: '#/components/schemas/MediaUploadCompleteCommand' },
	mediaUploadIntentCommand: { $ref: '#/components/schemas/MediaUploadIntentCommand' },
	mediaUploadIntent: { $ref: '#/components/schemas/MediaUploadIntent' },
	platformReviewQueue: { $ref: '#/components/schemas/PlatformReviewQueue' },
	publicListingPage: { $ref: '#/components/schemas/PublicListingPage' },
	publicStorefront: { $ref: '#/components/schemas/PublicStorefront' },
	publicVendorPage: { $ref: '#/components/schemas/PublicVendorPage' },
	storefrontUpdate: { $ref: '#/components/schemas/StorefrontUpdate' },
	storefrontUpdateResult: { $ref: '#/components/schemas/StorefrontUpdateResult' },
	vendorApplicationReview: { $ref: '#/components/schemas/VendorApplicationReview' },
	vendorCatalog: { $ref: '#/components/schemas/VendorCatalog' },
	vendorMemberships: { $ref: '#/components/schemas/VendorMemberships' },
	vendorApplicationCommand: { $ref: '#/components/schemas/VendorApplicationCommand' },
	vendorApplicationResult: { $ref: '#/components/schemas/VendorApplicationResult' },
	vendorApplicationReviewResult: { $ref: '#/components/schemas/VendorApplicationReviewResult' },
} as const

function publicSchemas(): Record<string, SchemaObject> {
	return {
		AccessContextResponse: schemaFor(AccessContextResponseSchema),
		ActiveVendorSelection: schemaFor(ActiveVendorSelectionSchema),
		ActiveVendorSelectionResult: schemaFor(ActiveVendorSelectionResultSchema),
		ApiError: schemaFor(ApiErrorSchema),
		CatalogImportCommand: schemaFor(CatalogImportCommandSchema),
		CatalogImportResult: schemaFor(CatalogImportResultSchema),
		CatalogHealth: schemaFor(CatalogHealthSchema),
		CustomerDiscoveryState: schemaFor(CustomerDiscoveryStateSchema),
		HealthResponse: schemaFor(HealthResponseSchema),
		IdentityVerificationSession: schemaFor(IdentityVerificationSessionSchema),
		IdentityVerificationStatus: schemaFor(IdentityVerificationStatusSchema),
		InventoryAvailability: schemaFor(InventoryAvailabilitySchema),
		InventoryMovementCommand: schemaFor(InventoryMovementCommandSchema),
		InventoryMovementResult: schemaFor(InventoryMovementResultSchema),
		LocationRead: schemaFor(LocationReadSchema),
		ListingCommandResult: schemaFor(ListingCommandResultSchema),
		ListingDraft: schemaFor(ListingDraftSchema),
		ListingRevisionCommand: schemaFor(ListingRevisionCommandSchema),
		ListingReviewCommand: schemaFor(ListingReviewCommandSchema),
		MediaAsset: schemaFor(MediaAssetSchema),
		MediaProcessingCommand: schemaFor(MediaProcessingCommandSchema),
		MediaPreview: schemaFor(MediaPreviewSchema),
		MediaReviewCommand: schemaFor(MediaReviewCommandSchema),
		MediaReviewQueue: schemaFor(MediaReviewQueueSchema),
		MediaReviewResult: schemaFor(MediaReviewResultSchema),
		MediaUploadCompleteCommand: schemaFor(MediaUploadCompleteCommandSchema),
		MediaUploadIntentCommand: schemaFor(MediaUploadIntentCommandSchema),
		MediaUploadIntent: schemaFor(MediaUploadIntentSchema),
		PlatformReviewQueue: schemaFor(PlatformReviewQueueSchema),
		PublicListingPage: schemaFor(PublicListingPageSchema),
		PublicStorefront: schemaFor(PublicStorefrontSchema),
		PublicVendorPage: schemaFor(PublicVendorPageSchema),
		StorefrontUpdate: schemaFor(StorefrontUpdateSchema),
		StorefrontUpdateResult: schemaFor(StorefrontUpdateResultSchema),
		VendorApplicationReview: schemaFor(VendorApplicationReviewSchema),
		VendorCatalog: schemaFor(VendorCatalogSchema),
		VendorMemberships: schemaFor(VendorMembershipsSchema),
		VendorApplicationCommand: schemaFor(VendorApplicationCommandSchema),
		VendorApplicationResult: schemaFor(VendorApplicationResultSchema),
		VendorApplicationReviewResult: schemaFor(VendorApplicationReviewResultSchema),
	}
}

export function createSwaggerDocument(app: INestApplication): OpenAPIObject {
	const config = new DocumentBuilder()
		.setTitle('Project Junction API')
		.setDescription(
			'Private staging API backed by real account and provider integrations. Every response declares X-API-Version: v1 and X-API-Lifecycle: active.',
		)
		.setVersion('v1')
		.addApiKey(
			{
				type: 'apiKey',
				in: 'cookie',
				name: '__Secure-junction-auth.session_token',
				description: 'Better Auth session cookie for private staging identity.',
			},
			'junction-auth-cookie',
		)
		.build()
	const document = SwaggerModule.createDocument(app, config)
	document.components = {
		...document.components,
		schemas: {
			...document.components?.schemas,
			...publicSchemas(),
		},
	}
	if (document.paths['/v1/health']?.get) document.paths['/v1/health'].get.summary = 'Read private staging API health.'
	if (document.paths['/v1/public/vendors']?.get) document.paths['/v1/public/vendors'].get.summary = 'Browse published Vendor summaries.'

	return document
}

export function configureSwagger(app: INestApplication): void {
	const document = createSwaggerDocument(app)

	SwaggerModule.setup('docs', app, document, {
		customSiteTitle: 'Project Junction API docs',
		useGlobalPrefix: true,
	})
}
