import {render, screen} from '@testing-library/react';
import {createElement} from 'react';
import {describe, expect, it} from 'vitest';

import {EventDetail} from '@/components/marketing/event-detail';
import {NewsDetail} from '@/components/marketing/news-detail';

describe('detail views', () => {
  it('renders a validated event fixture with one heading and date', () => {
    render(createElement(EventDetail, {title: 'Demo Day', record: {
      slug: 'demo-day', startsAt: '2026-08-01T02:00:00.000Z', endsAt: null,
      venue: 'WTIA', image: '/images/projects-hero.jpg', namespace: 'events.demo'
    }}));
    expect(screen.getAllByRole('heading', {level: 1})).toHaveLength(1);
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it('renders a validated news fixture with one heading and date', () => {
    render(createElement(NewsDetail, {title: 'Verified update', record: {
      slug: 'verified-update', publishedAt: '2026-08-01T02:00:00.000Z',
      image: '/images/projects-hero.jpg', namespace: 'news.verified'
    }}));
    expect(screen.getAllByRole('heading', {level: 1})).toHaveLength(1);
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });
});
