import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PrivacyPage } from './PrivacyPage'

describe('PrivacyPage', () => {
  it('explains the limited Gmail use and provides a return link', () => {
    render(<PrivacyPage />)

    expect(screen.getByRole('heading', { name: 'How Altrium handles information' })).toBeInTheDocument()
    expect(screen.getByText(/does not request permission to read, search, modify or delete messages/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Return to sign in' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: /Google API Services User Data Policy/i })).toHaveAttribute('href', 'https://developers.google.com/terms/api-services-user-data-policy')
  })
})
