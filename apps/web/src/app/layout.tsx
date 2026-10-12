import './global.css'

import type { Metadata } from 'next'

import { SavedListingsProvider } from '@/components/listing-save-button'
import { ThemeProvider } from '@/components/theme-provider'
import { runtimeLabel } from '@/lib/runtime-label'

export const metadata: Metadata = {
	title: `Junction | ${runtimeLabel}`,
	description: `Browse approved Vendor offerings in ${runtimeLabel.toLowerCase()}.`,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" suppressHydrationWarning className="font-sans">
			<body className="min-w-80 bg-background text-foreground">
				<ThemeProvider attribute="class" defaultTheme="system" enableSystem enableColorScheme disableTransitionOnChange storageKey="junction-theme">
					<SavedListingsProvider>{children}</SavedListingsProvider>
				</ThemeProvider>
			</body>
		</html>
	)
}
