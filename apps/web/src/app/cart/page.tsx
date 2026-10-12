import { AppointmentIntents } from '@/components/appointment-intents'
import { GoodsCart } from '@/components/goods-cart'
import { MarketplaceFooter } from '@/components/marketplace-footer'
import { MarketplaceHeader } from '@/components/marketplace-header'

export default function CartPage() {
	return (
		<>
			<main className="min-h-svh bg-background">
				<MarketplaceHeader />
				<section className="mx-auto max-w-3xl px-5 py-12 text-center sm:px-8">
					<h1 className="mb-8 text-3xl font-semibold tracking-tight">Cart</h1>
					<AppointmentIntents />
					<section className="mt-10 border-t pt-8" aria-labelledby="goods-cart-title">
						<h2 id="goods-cart-title" className="mb-6 text-xl font-semibold">
							Goods
						</h2>
						<GoodsCart />
					</section>
				</section>
			</main>
			<MarketplaceFooter />
		</>
	)
}
