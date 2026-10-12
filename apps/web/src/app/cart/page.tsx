import { GoodsCart } from '@/components/goods-cart'
import { MarketplaceFooter } from '@/components/marketplace-footer'
import { MarketplaceHeader } from '@/components/marketplace-header'

export default function CartPage() {
	return (
		<>
			<main className="min-h-svh bg-background">
				<MarketplaceHeader />
				<section className="mx-auto max-w-3xl px-5 py-12 text-center sm:px-8">
					<h1 className="mb-8 text-3xl font-semibold tracking-tight">Goods Cart</h1>
					<GoodsCart />
				</section>
			</main>
			<MarketplaceFooter />
		</>
	)
}
