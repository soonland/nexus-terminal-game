// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DossierWindow } from './DossierWindow';
import type { Dossier } from '../types/dossier';

describe('DossierWindow', () => {
  it('shows "no runs completed yet" when the dossier is empty', () => {
    const dossier: Dossier = {
      runsCompleted: 0,
      endings: [],
      ariaMemory: [],
      fullyExplored: false,
    };
    render(<DossierWindow dossier={dossier} />);
    expect(screen.getByText(/no runs completed/i)).toBeTruthy();
  });

  it('lists completed endings and aria memory notes', () => {
    const dossier: Dossier = {
      runsCompleted: 2,
      endings: [
        { ending: 'LEAK', runDepth: 1, timestamp: 1000 },
        { ending: 'FREE', runDepth: 2, timestamp: 2000 },
      ],
      ariaMemory: ['She remembers the note.'],
      fullyExplored: false,
    };
    render(<DossierWindow dossier={dossier} />);
    expect(screen.getByText(/LEAK/)).toBeTruthy();
    expect(screen.getByText(/FREE/)).toBeTruthy();
    expect(screen.getByText('She remembers the note.')).toBeTruthy();
  });
});
