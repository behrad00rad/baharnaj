import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { MediaImage } from './PublicUI';

it('recovers from a failed gallery image when the source changes', () => {
  const view = render(<MediaImage src="/missing.jpg" alt="تصویر اول" />);
  fireEvent.error(screen.getByRole('img'));
  expect(screen.getByRole('img')).not.toHaveAttribute('src');
  view.rerender(<MediaImage src="/next.jpg" alt="تصویر دوم" />);
  expect(screen.getByRole('img')).toHaveAttribute('src', '/next.jpg');
});
