import type { INestApplication } from '@nestjs/common'
import { DocumentBuilder, type OpenAPIObject, type SchemaObject, SwaggerModule } from '@nestjs/swagger'
import {
	AccessContextResponseSchema,
	ApiErrorSchema,
	AuditMarkerCommandSchema,
	CatalogHealthSchema,
	CatalogImportCommandSchema,
	CatalogImportResultSchema,
	CommandOutcomeSchema,
	CustomerDiscoveryStateSchema,
	DemoSessionSchema,
	DemoWorkspaceSchema,
	HealthResponseSchema,
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
	ProviderWebhookReceiptSchema,
	PublicListingPageSchema,
	PublicStorefrontSchema,
	PublicVendorPageSchema,
	StorefrontUpdateResultSchema,
	StorefrontUpdateSchema,
	SyntheticAccountProvisionSchema,
	SyntheticAccountSchema,
	SyntheticProviderCallbackSchema,
	SyntheticStaffGrantResultSchema,
	SyntheticStaffGrantSchema,
	SyntheticStaffRevokeResultSchema,
	VendorApplicationCommandSchema,
	VendorApplicationResultSchema,
	VendorApplicationReviewResultSchema,
	VendorApplicationReviewSchema,
	VendorCatalogSchema,
} from 'contracts'
import { z } from 'zod'

function schemaFor(schema: z.ZodType): SchemaObject {
	const openApiSchema = z.toJSONSchema(schema, { target: 'openapi-3.0' })
	delete openApiSchema.$schema
	return openApiSchema as SchemaObject
}

export const OpenApiSchemaRefs = {
	accessContext: { $ref: '#/components/schemas/AccessContextResponse' },
	apiError: { $ref: '#/components/schemas/ApiError' },
	auditMarkerCommand: { $ref: '#/components/schemas/AuditMarkerCommand' },
	catalogImportCommand: { $ref: '#/components/schemas/CatalogImportCommand' },
	catalogImportResult: { $ref: '#/components/schemas/CatalogImportResult' },
	catalogHealth: { $ref: '#/components/schemas/CatalogHealth' },
	commandOutcome: { $ref: '#/components/schemas/CommandOutcome' },
	customerDiscoveryState: { $ref: '#/components/schemas/CustomerDiscoveryState' },
	demoWorkspace: { $ref: '#/components/schemas/DemoWorkspace' },
	syntheticAccountProvision: { $ref: '#/components/schemas/SyntheticAccountProvision' },
	syntheticAccount: { $ref: '#/components/schemas/SyntheticAccount' },
	syntheticStaffGrant: { $ref: '#/components/schemas/SyntheticStaffGrant' },
	syntheticStaffGrantResult: { $ref: '#/components/schemas/SyntheticStaffGrantResult' },
	syntheticStaffRevokeResult: { $ref: '#/components/schemas/SyntheticStaffRevokeResult' },
	demoSession: { $ref: '#/components/schemas/DemoSession' },
	healthResponse: { $ref: '#/components/schemas/HealthResponse' },
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
	providerWebhookReceipt: { $ref: '#/components/schemas/ProviderWebhookReceipt' },
	publicVendorPage: { $ref: '#/components/schemas/PublicVendorPage' },
	storefrontUpdate: { $ref: '#/components/schemas/StorefrontUpdate' },
	storefrontUpdateResult: { $ref: '#/components/schemas/StorefrontUpdateResult' },
	syntheticProviderCallback: { $ref: '#/components/schemas/SyntheticProviderCallback' },
	vendorApplicationReview: { $ref: '#/components/schemas/VendorApplicationReview' },
	vendorCatalog: { $ref: '#/components/schemas/VendorCatalog' },
	vendorApplicationCommand: { $ref: '#/components/schemas/VendorApplicationCommand' },
	vendorApplicationResult: { $ref: '#/components/schemas/VendorApplicationResult' },
	vendorApplicationReviewResult: { $ref: '#/components/schemas/VendorApplicationReviewResult' },
} as const

function publicSchemas(): Record<string, SchemaObject> {
	return {
		AccessContextResponse: schemaFor(AccessContextResponseSchema),
		ApiError: schemaFor(ApiErrorSchema),
		AuditMarkerCommand: schemaFor(AuditMarkerCommandSchema),
		CatalogImportCommand: schemaFor(CatalogImportCommandSchema),
		CatalogImportResult: schemaFor(CatalogImportResultSchema),
		CatalogHealth: schemaFor(CatalogHealthSchema),
		CommandOutcome: schemaFor(CommandOutcomeSchema),
		CustomerDiscoveryState: schemaFor(CustomerDiscoveryStateSchema),
		DemoWorkspace: schemaFor(DemoWorkspaceSchema),
		SyntheticAccountProvision: schemaFor(SyntheticAccountProvisionSchema),
		SyntheticAccount: schemaFor(SyntheticAccountSchema),
		SyntheticStaffGrant: schemaFor(SyntheticStaffGrantSchema),
		SyntheticStaffGrantResult: schemaFor(SyntheticStaffGrantResultSchema),
		SyntheticStaffRevokeResult: schemaFor(SyntheticStaffRevokeResultSchema),
		DemoSession: schemaFor(DemoSessionSchema),
		HealthResponse: schemaFor(HealthResponseSchema),
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
		ProviderWebhookReceipt: schemaFor(ProviderWebhookReceiptSchema),
		PublicVendorPage: schemaFor(PublicVendorPageSchema),
		StorefrontUpdate: schemaFor(StorefrontUpdateSchema),
		StorefrontUpdateResult: schemaFor(StorefrontUpdateResultSchema),
		SyntheticProviderCallback: schemaFor(SyntheticProviderCallbackSchema),
		VendorApplicationReview: schemaFor(VendorApplicationReviewSchema),
		VendorCatalog: schemaFor(VendorCatalogSchema),
		VendorApplicationCommand: schemaFor(VendorApplicationCommandSchema),
		VendorApplicationResult: schemaFor(VendorApplicationResultSchema),
		VendorApplicationReviewResult: schemaFor(VendorApplicationReviewResultSchema),
	}
}

export function createSwaggerDocument(app: INestApplication): OpenAPIObject {
	const config = new DocumentBuilder()
		.setTitle('Project Junction API')
		.setDescription(
			'Synthetic-runtime API for the Project Junction platform foundation. Every response declares X-API-Version: v1 and X-API-Lifecycle: active.',
		)
		.setVersion('v1')
		.addApiKey(
			{
				type: 'apiKey',
				in: 'header',
				name: 'x-junction-session',
				description: 'Synthetic session identifier used by the current foundation endpoints.',
			},
			'junction-session',
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

	return document
}

export function configureSwagger(app: INestApplication): void {
	const document = createSwaggerDocument(app)

	SwaggerModule.setup('docs', app, document, {
		customSiteTitle: 'Project Junction API docs',
		useGlobalPrefix: true,
	})
}
