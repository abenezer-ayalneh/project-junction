'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import { buttonVariants } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const themeOptions = [
	{ value: 'light', label: 'Light', Icon: Sun },
	{ value: 'dark', label: 'Dark', Icon: Moon },
	{ value: 'system', label: 'System', Icon: Monitor },
] as const

type ThemeChoice = (typeof themeOptions)[number]['value']

function isThemeChoice(value: string | undefined): value is ThemeChoice {
	return themeOptions.some((option) => option.value === value)
}

export function ThemeToggle() {
	const { setTheme, theme } = useTheme()
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		setMounted(true)
	}, [])

	const selectedTheme = mounted && isThemeChoice(theme) ? theme : 'system'

	return (
		<DropdownMenu>
			<DropdownMenuTrigger className={buttonVariants({ variant: 'outline', size: 'icon-lg' })} aria-label="Choose color theme">
				<Sun className="size-4 dark:hidden" aria-hidden="true" />
				<Moon className="hidden size-4 dark:block" aria-hidden="true" />
				<span className="sr-only">Choose color theme</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-40">
				<DropdownMenuGroup>
					<DropdownMenuLabel>Appearance</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuRadioGroup
						value={selectedTheme}
						onValueChange={(value) => {
							const nextTheme: unknown = value
							if (typeof nextTheme === 'string' && isThemeChoice(nextTheme)) {
								setTheme(nextTheme)
							}
						}}>
						{themeOptions.map(({ value, label, Icon }) => (
							<DropdownMenuRadioItem key={value} value={value} closeOnClick>
								<Icon aria-hidden="true" />
								{label}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
