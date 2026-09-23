import type { INestApplication } from '@nestjs/common'
import { DocumentBuilder, type OpenAPIObject, type SchemaObject, SwaggerModule } from '@nestjs/swagger'
import {
	AccessContextResponseSchema,
	ApiErrorSchema,
	AuditMarkerCommandSchema,
	CommandOutcomeSchema,
	DemoSessionSchema,
	DemoWorkspaceSchema,
	HealthResponseSchema,
	LocationReadSchema,
	ProviderWebhookReceiptSchema,
	PublicVendorPageSchema,
	SyntheticAccountProvisionSchema,
	SyntheticAccountSchema,
	SyntheticProviderCallbackSchema,
	SyntheticStaffGrantResultSchema,
	SyntheticStaffGrantSchema,
	SyntheticStaffRevokeResultSchema,
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
	commandOutcome: { $ref: '#/components/schemas/CommandOutcome' },
	demoWorkspace: { $ref: '#/components/schemas/DemoWorkspace' },
	syntheticAccountProvision: { $ref: '#/components/schemas/SyntheticAccountProvision' },
	syntheticAccount: { $ref: '#/components/schemas/SyntheticAccount' },
	syntheticStaffGrant: { $ref: '#/components/schemas/SyntheticStaffGrant' },
	syntheticStaffGrantResult: { $ref: '#/components/schemas/SyntheticStaffGrantResult' },
	syntheticStaffRevokeResult: { $ref: '#/components/schemas/SyntheticStaffRevokeResult' },
	demoSession: { $ref: '#/components/schemas/DemoSession' },
	healthResponse: { $ref: '#/components/schemas/HealthResponse' },
	locationRead: { $ref: '#/components/schemas/LocationRead' },
	providerWebhookReceipt: { $ref: '#/components/schemas/ProviderWebhookReceipt' },
	publicVendorPage: { $ref: '#/components/schemas/PublicVendorPage' },
	syntheticProviderCallback: { $ref: '#/components/schemas/SyntheticProviderCallback' },
} as const

function publicSchemas(): Record<string, SchemaObject> {
	return {
		AccessContextResponse: schemaFor(AccessContextResponseSchema),
		ApiError: schemaFor(ApiErrorSchema),
		AuditMarkerCommand: schemaFor(AuditMarkerCommandSchema),
		CommandOutcome: schemaFor(CommandOutcomeSchema),
		DemoWorkspace: schemaFor(DemoWorkspaceSchema),
		SyntheticAccountProvision: schemaFor(SyntheticAccountProvisionSchema),
		SyntheticAccount: schemaFor(SyntheticAccountSchema),
		SyntheticStaffGrant: schemaFor(SyntheticStaffGrantSchema),
		SyntheticStaffGrantResult: schemaFor(SyntheticStaffGrantResultSchema),
		SyntheticStaffRevokeResult: schemaFor(SyntheticStaffRevokeResultSchema),
		DemoSession: schemaFor(DemoSessionSchema),
		HealthResponse: schemaFor(HealthResponseSchema),
		LocationRead: schemaFor(LocationReadSchema),
		ProviderWebhookReceipt: schemaFor(ProviderWebhookReceiptSchema),
		PublicVendorPage: schemaFor(PublicVendorPageSchema),
		SyntheticProviderCallback: schemaFor(SyntheticProviderCallbackSchema),
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
