import './global.css'

export const metadata = {
	title: 'Project Junction | Platform Foundation',
	description: 'Synthetic-only platform foundation for Project Junction.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body>{children}</body>
		</html>
	)
}
