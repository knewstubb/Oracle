import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useCardHoverPreview, showCardPreview, hideCardPreview, setPreviewImage } from './CardHoverPreview'

const ID = 'abcd1234-0000-0000-0000-000000000000'
const URL = `https://cards.scryfall.io/large/front/a/b/${ID}.jpg`

afterEach(() => {
  cleanup()
  hideCardPreview()
})

function Thumb({ id }: { id: string | null }) {
  const { triggerProps } = useCardHoverPreview({ scryfallId: id, cardName: 'Spare Rock' })
  return <span data-testid="thumb" {...triggerProps}>thumb</span>
}

const portal = () => document.getElementById('card-hover-preview-portal') as HTMLElement
const img = () => document.getElementById('card-hover-preview-img') as HTMLImageElement

describe('card hover preview image', () => {
  it('hovering a trigger puts the card image in a portal on the page body, above dialogs', () => {
    render(<Thumb id={ID} />)
    fireEvent.mouseEnter(screen.getByTestId('thumb'), { clientX: 100, clientY: 100 })
    expect(portal().parentElement).toBe(document.body)
    expect(Number(portal().style.zIndex)).toBeGreaterThan(50) // dialogs and the panel are z-50
    expect(portal().style.pointerEvents).toBe('none')
    expect(img().src).toBe(URL)
    expect(img().alt).toBe('Spare Rock')
  })

  it('shows once the image has loaded', () => {
    render(<Thumb id="ffff1234-0000-0000-0000-000000000000" />)
    fireEvent.mouseEnter(screen.getByTestId('thumb'), { clientX: 100, clientY: 100 })
    expect(portal().style.opacity).toBe('0')
    img().dispatchEvent(new Event('load'))
    expect(portal().style.opacity).toBe('1')
  })

  it('a failed image is retried once through the Scryfall API redirect', () => {
    render(<Thumb id={ID} />)
    fireEvent.mouseEnter(screen.getByTestId('thumb'), { clientX: 100, clientY: 100 })
    img().dispatchEvent(new Event('error'))
    expect(img().src).toBe(`https://api.scryfall.com/cards/${ID}?format=image&version=large`)
    img().dispatchEvent(new Event('load'))
    expect(portal().style.opacity).toBe('1')
  })

  it('after both attempts fail the frame hides, and the next hover tries again instead of showing an empty frame', () => {
    render(<Thumb id={ID} />)
    fireEvent.mouseEnter(screen.getByTestId('thumb'), { clientX: 100, clientY: 100 })
    img().dispatchEvent(new Event('error'))
    img().dispatchEvent(new Event('error'))
    expect(img().style.display).toBe('none')
    expect(portal().style.opacity).toBe('0')
    fireEvent.mouseLeave(screen.getByTestId('thumb'))
    fireEvent.mouseEnter(screen.getByTestId('thumb'), { clientX: 100, clientY: 100 })
    expect(img().style.display).toBe('block')
    expect(img().src).toBe(URL)
    expect(portal().style.opacity).toBe('0') // waits for the image, never the info strip alone
  })

  it('setPreviewImage shows immediately when the same image is already loaded', () => {
    showCardPreview(ID, 'Spare Rock', 10, 10)
    img().dispatchEvent(new Event('load'))
    setPreviewImage(img(), portal(), ID, 'Spare Rock')
    expect(portal().style.opacity).toBe('1')
  })

  it('does nothing for a card with no printing id', () => {
    render(<Thumb id={null} />)
    const before = img()?.src ?? ''
    fireEvent.mouseEnter(screen.getByTestId('thumb'), { clientX: 100, clientY: 100 })
    expect(img()?.src ?? '').toBe(before)
  })
})
