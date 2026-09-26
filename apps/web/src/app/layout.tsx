import './global.css'

import type { Metadata } from 'next'
import { Geist } from 'next/font/google'

import { ThemeProvider } from '@/components/theme-provider'

const geist = Geist({
	subsets: ['latin'],
	variable: '--font-sans',
})

export const metadata: Metadata = {
	title: process.env.NEXT_PUBLIC_JUNCTION_RUNTIME_MODE === 'staging' ? 'Junction | Private staging' : 'Junction | Local discovery preview',
	description:
		process.env.NEXT_PUBLIC_JUNCTION_RUNTIME_MODE === 'staging'
			? 'Browse approved Vendor offerings in the private staging environment.'
			: 'Browse approved local Vendor offerings in a synthetic discovery preview.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" suppressHydrationWarning className={`${geist.variable} font-sans`}>
			<body className="min-w-80 bg-background text-foreground">
				<ThemeProvider attribute="class" defaultTheme="system" enableSystem enableColorScheme disableTransitionOnChange storageKey="junction-theme">
					{children}
				</ThemeProvider>
			</body>
		</html>
	)
}
