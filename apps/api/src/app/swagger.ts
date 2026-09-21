import type { INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

export function configureSwagger(app: INestApplication): void {
	const config = new DocumentBuilder()
		.setTitle('Project Junction API')
		.setDescription('Synthetic-runtime API for the Project Junction platform foundation.')
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

	SwaggerModule.setup('docs', app, document, {
		customSiteTitle: 'Project Junction API docs',
		useGlobalPrefix: true,
	})
}
