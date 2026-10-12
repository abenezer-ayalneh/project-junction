'use client'

import { ImageOff, Play } from 'lucide-react'
import { useId, useRef, useState } from 'react'

export function ListingMedia({
	title,
	kind,
	images = [],
	shortVideo,
	gallery = false,
	priority = false,
}: {
	title: string
	kind: 'product' | 'service'
	images?: Array<{ id: string; alt: string; width?: number; height?: number }>
	shortVideo?: { id: string; description: string | null; hasCaptions: boolean }
	gallery?: boolean
	priority?: boolean
}) {
	const [failed, setFailed] = useState(false)
	const [selectedImageIndex, setSelectedImageIndex] = useState(0)
	const dialogRef = useRef<HTMLDialogElement>(null)
	const enlargeRef = useRef<HTMLButtonElement>(null)
	const dialogTitleId = useId()
	const primaryImage = images[selectedImageIndex] ?? images[0]
	const hasApprovedImage = Boolean((primaryImage || shortVideo) && !failed)
	const mediaSource = primaryImage ? `/v1/public/media/${primaryImage.id}/image` : shortVideo ? `/v1/public/media/${shortVideo.id}/poster` : undefined
	function selectImage(index: number) {
		setSelectedImageIndex(index)
		setFailed(false)
	}

	return (
		<div
			className="relative aspect-square overflow-hidden border-b bg-muted/40"
			aria-label={hasApprovedImage ? `Approved media for ${title}` : `No approved image for ${title}`}>
			{hasApprovedImage && mediaSource ? (
				<>
					<img
						alt={primaryImage?.alt || shortVideo?.description || `Approved media for ${title}`}
						className={kind === 'product' ? 'size-full object-contain p-4' : 'size-full object-cover'}
						fetchPriority={priority ? 'high' : 'auto'}
						loading={priority ? 'eager' : 'lazy'}
						onError={() => setFailed(true)}
						src={mediaSource}
					/>
					{shortVideo ? (
						<span className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium shadow-sm">
							<Play className="size-3" aria-hidden="true" />
							Video available
						</span>
					) : null}
				</>
			) : (
				<div className="flex size-full flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
					<ImageOff className="size-6" aria-hidden="true" />
					<span className="text-xs font-medium">Image not available</span>
				</div>
			)}
			{gallery && primaryImage ? (
				<>
					<button
						ref={enlargeRef}
						type="button"
						className="absolute left-3 top-3 rounded-lg border bg-background px-3 py-2 text-sm font-medium"
						onClick={() => dialogRef.current?.showModal()}>
						Enlarge image
					</button>
					<dialog
						ref={dialogRef}
						aria-labelledby={dialogTitleId}
						className="m-auto max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-5xl overflow-auto rounded-xl border bg-background p-4 text-foreground backdrop:bg-black/70"
						onClose={() => enlargeRef.current?.focus()}
						onKeyDown={(event) => {
							if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
								event.preventDefault()
								selectImage((selectedImageIndex + (event.key === 'ArrowLeft' ? -1 : 1) + images.length) % images.length)
							}
						}}>
						<div className="flex items-start justify-between gap-4">
							<h2 id={dialogTitleId} className="min-w-0 break-words text-lg font-semibold">
								{title} — image {selectedImageIndex + 1} of {images.length}
							</h2>
							<button type="button" autoFocus className="shrink-0 rounded-lg border px-3 py-2 text-sm" onClick={() => dialogRef.current?.close()}>
								Close
							</button>
						</div>
						{failed ? (
							<p className="py-12 text-center text-muted-foreground" role="status">
								Image not available. Choose another image or close this view.
							</p>
						) : (
							<img
								alt={primaryImage.alt}
								className="mt-4 max-h-[65svh] w-full object-contain"
								src={`/v1/public/media/${primaryImage.id}/image`}
								onError={() => setFailed(true)}
							/>
						)}
						<p className="mt-3 text-sm text-muted-foreground">{primaryImage.alt}</p>
						{images.length > 1 ? (
							<div className="mt-4 flex justify-between gap-3">
								<button
									type="button"
									className="rounded-lg border px-3 py-2 text-sm"
									onClick={() => selectImage((selectedImageIndex - 1 + images.length) % images.length)}>
									Previous image
								</button>
								<button
									type="button"
									className="rounded-lg border px-3 py-2 text-sm"
									onClick={() => selectImage((selectedImageIndex + 1) % images.length)}>
									Next image
								</button>
							</div>
						) : null}
					</dialog>
				</>
			) : null}
			{gallery && images.length > 1 ? (
				<div
					className="absolute inset-x-0 bottom-0 flex gap-2 overflow-x-auto bg-background/90 p-3 backdrop-blur-sm"
					aria-label="Choose a listing image">
					{images.map((image, index) => (
						<button
							aria-label={`Show image ${index + 1}: ${image.alt}`}
							aria-pressed={primaryImage?.id === image.id}
							className={`shrink-0 overflow-hidden rounded-md border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
								primaryImage?.id === image.id ? 'border-foreground' : 'border-transparent hover:border-muted-foreground'
							}`}
							onClick={() => {
								selectImage(index)
							}}
							type="button"
							key={image.id}>
							<img alt="" className="size-14 object-cover" loading="lazy" src={`/v1/public/media/${image.id}/image`} />
						</button>
					))}
				</div>
			) : null}
		</div>
	)
}
