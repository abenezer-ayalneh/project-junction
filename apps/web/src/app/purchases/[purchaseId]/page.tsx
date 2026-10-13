import { MarketplaceFooter } from '@/components/marketplace-footer'
import { MarketplaceHeader } from '@/components/marketplace-header'
import { PurchaseDetail } from '@/components/purchase-detail'

export default async function PurchasePage({ params }: { params: Promise<{ purchaseId: string }> }) {
	const { purchaseId } = await params
	return (
		<>
			<main className="min-h-svh bg-background">
				<MarketplaceHeader />
				<section className="mx-auto max-w-3xl px-5 py-12 text-center sm:px-8">
					<h1 className="mb-8 text-3xl font-semibold">Purchase</h1>
					<PurchaseDetail purchaseId={purchaseId} />
				</section>
			</main>
			<MarketplaceFooter />
		</>
	)
}
