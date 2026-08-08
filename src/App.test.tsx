import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders greeting', () => {
    render(<App />);
    const heading = screen.getByText('Hello from App');
    expect(heading).toBeTruthy();
  });
});
