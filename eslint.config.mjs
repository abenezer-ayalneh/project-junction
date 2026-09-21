import eslint from '@eslint/js'
import nx from '@nx/eslint-plugin'
import eslintConfigPrettier from 'eslint-config-prettier'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import unusedImports from 'eslint-plugin-unused-imports'
import globals from 'globals'
import tsEslint from 'typescript-eslint'

const typedSourceFiles = ['**/src/**/*.ts', '**/src/**/*.tsx', '**/src/**/*.cts', '**/src/**/*.mts']

export default [
	...nx.configs['flat/base'],
	...nx.configs['flat/typescript'],
	...nx.configs['flat/javascript'],
	eslint.configs.recommended,
	{
		ignores: ['eslint.config.mjs', '**/dist', '**/out-tsc'],
	},
	...tsEslint.configs.recommendedTypeChecked.map((config) => ({
		...config,
		files: typedSourceFiles,
	})),
	eslintPluginPrettierRecommended,
	{
		files: ['**/*.ts', '**/*.tsx', '**/*.cts', '**/*.mts', '**/*.js', '**/*.jsx', '**/*.cjs', '**/*.mjs'],
		languageOptions: {
			globals: {
				...globals.node,
				...globals.jest,
			},
		},
	},
	{
		plugins: {
			'simple-import-sort': simpleImportSort,
			'unused-imports': unusedImports,
		},
		rules: {
			'simple-import-sort/imports': 'error',
			'simple-import-sort/exports': 'error',
			'no-unused-vars': 'off',
			'unused-imports/no-unused-imports': 'error',
			'unused-imports/no-unused-vars': [
				'warn',
				{
					vars: 'all',
					varsIgnorePattern: '.*',
					args: 'after-used',
					argsIgnorePattern: '.*',
				},
			],
		},
	},
	{
		files: typedSourceFiles,
		languageOptions: {
			globals: {
				...globals.node,
				...globals.jest,
			},
			ecmaVersion: 'latest',
			sourceType: 'module',
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			'no-undef': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-floating-promises': 'warn',
			'@typescript-eslint/no-unsafe-argument': 'warn',
		},
	},
	{
		files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
		rules: {
			'@nx/enforce-module-boundaries': [
				'error',
				{
					enforceBuildableLibDependency: true,
					allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
					depConstraints: [
						{
							sourceTag: 'type:contract',
							onlyDependOnLibsWithTags: ['type:contract', 'scope:shared'],
						},
						{
							sourceTag: 'type:domain',
							onlyDependOnLibsWithTags: ['type:contract', 'type:domain', 'scope:shared', 'scope:platform'],
						},
						{
							sourceTag: 'type:app',
							onlyDependOnLibsWithTags: ['type:contract', 'type:domain', 'scope:shared', 'scope:platform'],
						},
					],
				},
			],
		},
	},
	{
		files: ['**/*.ts', '**/*.tsx', '**/*.cts', '**/*.mts', '**/*.js', '**/*.jsx', '**/*.cjs', '**/*.mjs'],
		// Override or add rules here
		rules: {},
	},
	eslintConfigPrettier,
]
