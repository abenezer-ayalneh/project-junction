import { MAKER_NAME } from '../shared/identity'

/** Browser-only enhancement. The anchor remains fully usable before hydration. */
export function attachMakerTooltip(link: HTMLAnchorElement): () => void {
	const doc = link.ownerDocument
	const win = doc.defaultView
	if (!win) return () => undefined

	let tooltip: HTMLDivElement | null = null
	let overLink = false
	let overTooltip = false
	let focused = false
	let dismissed = false
	let closeTimer: ReturnType<typeof setTimeout> | undefined

	const cancelClose = () => clearTimeout(closeTimer)
	const position = () => {
		if (!tooltip) return
		const anchor = link.getBoundingClientRect()
		const viewport = win.visualViewport
		const minX = (viewport?.offsetLeft ?? 0) + 8
		const minY = (viewport?.offsetTop ?? 0) + 8
		const maxX = (viewport?.offsetLeft ?? 0) + (viewport?.width ?? win.innerWidth) - 8
		const maxY = (viewport?.offsetTop ?? 0) + (viewport?.height ?? win.innerHeight) - 8
		tooltip.style.maxWidth = `${maxX - minX}px`
		const box = tooltip.getBoundingClientRect()
		const top = anchor.top - box.height >= minY ? anchor.top - box.height : anchor.bottom
		tooltip.style.left = `${Math.max(minX, Math.min(anchor.left + (anchor.width - box.width) / 2, maxX - box.width))}px`
		tooltip.style.top = `${Math.max(minY, Math.min(top, maxY - box.height))}px`
	}
	const hide = () => {
		cancelClose()
		tooltip?.remove()
		tooltip = null
		overTooltip = false
		win.removeEventListener('resize', position)
		doc.removeEventListener('scroll', position, true)
		win.visualViewport?.removeEventListener('resize', position)
		win.visualViewport?.removeEventListener('scroll', position)
	}
	const scheduleClose = () => {
		cancelClose()
		closeTimer = setTimeout(() => {
			if (!overLink && !overTooltip && !focused) hide()
		}, 100)
	}
	const show = () => {
		cancelClose()
		if (dismissed || tooltip) return
		tooltip = doc.createElement('div')
		tooltip.className = 'aa-maker__tooltip'
		// The complete name already labels the link. Avoid announcing it twice.
		tooltip.setAttribute('aria-hidden', 'true')
		tooltip.style.fontFamily = win.getComputedStyle(link).fontFamily
		const label = doc.createElement('span')
		label.className = 'aa-maker__tooltip-label'
		label.textContent = MAKER_NAME
		tooltip.append(label)
		tooltip.addEventListener('pointerenter', () => {
			overTooltip = true
			cancelClose()
		})
		tooltip.addEventListener('pointerleave', () => {
			overTooltip = false
			scheduleClose()
		})
		doc.body.append(tooltip)
		// Top-layer placement avoids overflow clipping, transforms, and stacking contexts.
		// Older browsers retain a fixed, body-mounted fallback.
		if (typeof tooltip.showPopover === 'function') {
			tooltip.setAttribute('popover', 'manual')
			tooltip.showPopover()
		}
		position()
		win.addEventListener('resize', position)
		doc.addEventListener('scroll', position, true)
		win.visualViewport?.addEventListener('resize', position)
		win.visualViewport?.addEventListener('scroll', position)
	}
	const enter = (event: PointerEvent) => {
		if (event.pointerType === 'touch' || !win.matchMedia('(any-hover: hover)').matches) return
		overLink = true
		dismissed = false
		show()
	}
	const leave = () => {
		overLink = false
		scheduleClose()
	}
	const focus = () => {
		if (!link.matches(':focus-visible')) return
		focused = true
		dismissed = false
		show()
	}
	const blur = () => {
		focused = false
		scheduleClose()
	}
	const keydown = (event: KeyboardEvent) => {
		if (event.key === 'Escape' && tooltip) {
			dismissed = true
			hide()
		}
	}
	const touch = (event: PointerEvent) => {
		if (event.pointerType === 'touch') {
			focused = false
			overLink = false
			hide()
		}
	}
	link.addEventListener('pointerenter', enter)
	link.addEventListener('pointerleave', leave)
	link.addEventListener('pointerdown', touch)
	link.addEventListener('focus', focus)
	link.addEventListener('blur', blur)
	doc.addEventListener('keydown', keydown)

	return () => {
		hide()
		link.removeEventListener('pointerenter', enter)
		link.removeEventListener('pointerleave', leave)
		link.removeEventListener('pointerdown', touch)
		link.removeEventListener('focus', focus)
		link.removeEventListener('blur', blur)
		doc.removeEventListener('keydown', keydown)
	}
}
