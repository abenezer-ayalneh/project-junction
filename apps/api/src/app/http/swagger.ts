import type { INestApplication } from '@nestjs/common'
import { DocumentBuilder, type OpenAPIObject, type SchemaObject, SwaggerModule } from '@nestjs/swagger'
import {
	AccessContextResponseSchema,
	ApiErrorSchema,
	AuditMarkerCommandSchema,
	CatalogImportCommandSchema,
	CatalogImportResultSchema,
	CommandOutcomeSchema,
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
	MediaProcessingCommandSchema,
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
	commandOutcome: { $ref: '#/components/schemas/CommandOutcome' },
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
	publicListingPage: { $ref: '#/components/schemas/PublicListingPage' },
	publicStorefront: { $ref: '#/components/schemas/PublicStorefront' },
	providerWebhookReceipt: { $ref: '#/components/schemas/ProviderWebhookReceipt' },
	publicVendorPage: { $ref: '#/components/schemas/PublicVendorPage' },
	storefrontUpdate: { $ref: '#/components/schemas/StorefrontUpdate' },
	storefrontUpdateResult: { $ref: '#/components/schemas/StorefrontUpdateResult' },
	syntheticProviderCallback: { $ref: '#/components/schemas/SyntheticProviderCallback' },
	vendorApplicationReview: { $ref: '#/components/schemas/VendorApplicationReview' },
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
		CommandOutcome: schemaFor(CommandOutcomeSchema),
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
		PublicListingPage: schemaFor(PublicListingPageSchema),
		PublicStorefront: schemaFor(PublicStorefrontSchema),
		ProviderWebhookReceipt: schemaFor(ProviderWebhookReceiptSchema),
		PublicVendorPage: schemaFor(PublicVendorPageSchema),
		StorefrontUpdate: schemaFor(StorefrontUpdateSchema),
		StorefrontUpdateResult: schemaFor(StorefrontUpdateResultSchema),
		SyntheticProviderCallback: schemaFor(SyntheticProviderCallbackSchema),
		VendorApplicationReview: schemaFor(VendorApplicationReviewSchema),
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
