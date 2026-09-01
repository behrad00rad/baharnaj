import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Gallery from './Gallery'

const { get } = vi.hoisted(() => ({ get: vi.fn((endpoint) => Promise.resolve({ data: endpoint === 'gallery/categories/' ? [{ id: 1, name: 'مو' }, { id: 2, name: 'ناخن' }] : [{ id: 1, title: 'Hair', category: 'مو', image_url: 'https://example.com/hair.jpg' }, { id: 2, title: 'Nails', category: 'ناخن', image_url: 'https://example.com/nails.jpg' }] })) }))
vi.mock('../shared/api', () => ({ api: { get } }))

describe('public gallery categories', () => {
  it('renders backend categories and filters gallery items', async () => {
    render(<Gallery />)
    await waitFor(() => expect(get).toHaveBeenCalledWith('gallery/categories/'))
    fireEvent.click(screen.getByRole('button', { name: 'ناخن' }))
    expect(screen.getByAltText('Nails')).toBeInTheDocument()
    expect(screen.queryByAltText('Hair')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'همه' }))
    expect(screen.getByAltText('Hair')).toBeInTheDocument()
  })
})
