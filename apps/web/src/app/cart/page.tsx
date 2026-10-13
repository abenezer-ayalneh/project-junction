import { MarketplaceFooter } from '@/components/marketplace-footer'
import { MarketplaceHeader } from '@/components/marketplace-header'
import { UnifiedCheckout } from '@/components/unified-checkout'

export default function CartPage() {
	return (
		<>
			<main className="min-h-svh bg-background">
				<MarketplaceHeader />
				<section className="mx-auto max-w-6xl px-5 py-12 text-center sm:px-8">
					<h1 className="mb-8 text-3xl font-semibold tracking-tight">Cart</h1>
					<UnifiedCheckout />
				</section>
			</main>
			<MarketplaceFooter />
		</>
	)
}
