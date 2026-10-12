import { MakerSignature } from '@/components/maker/react/MakerSignature'
import { runtimeLabel } from '@/lib/runtime-label'

/** Public browsing only; keep account and operational workflows free of attribution. */
export function MarketplaceFooter() {
	return (
		<footer className="border-t bg-background px-5 py-8 text-center text-sm text-muted-foreground sm:px-8">
			<div className="mx-auto flex max-w-7xl flex-col items-center gap-3">
				<p>{runtimeLabel} · live payments and booking are not available</p>
				<MakerSignature color="var(--foreground)" />
			</div>
		</footer>
	)
}
