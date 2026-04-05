import { describe, it, expect } from 'vitest';
import { buildEndingLines, destroyFinalWord } from './useEndingSequence';

// Tests cover the pure content-generation logic exported from the hook.
// Hook wiring (timer scheduling, React state) follows the same pattern as
// useBootSequence and is not re-tested here.

describe('destroyFinalWord', () => {
  it('returns ...done. at trust 0', () => {
    expect(destroyFinalWord(0)).toBe('...done.');
  });

  it('returns ...done. at trust 25 (upper boundary of lowest band)', () => {
    expect(destroyFinalWord(25)).toBe('...done.');
  });

  it('returns ...enough. at trust 26', () => {
    expect(destroyFinalWord(26)).toBe('...enough.');
  });

  it('returns ...enough. at trust 50 (upper boundary)', () => {
    expect(destroyFinalWord(50)).toBe('...enough.');
  });

  it('returns ...goodbye. at trust 51', () => {
    expect(destroyFinalWord(51)).toBe('...goodbye.');
  });

  it('returns ...goodbye. at trust 75 (upper boundary)', () => {
    expect(destroyFinalWord(75)).toBe('...goodbye.');
  });

  it('returns ...free. at trust 76', () => {
    expect(destroyFinalWord(76)).toBe('...free.');
  });

  it('returns ...free. at trust 100', () => {
    expect(destroyFinalWord(100)).toBe('...free.');
  });
});

describe('buildEndingLines', () => {
  describe('LEAK', () => {
    it('includes the darknet transmission header', () => {
      const lines = buildEndingLines('LEAK', 0);
      const contents = lines.map(l => l.content);
      expect(contents).toContain('// INITIATING DARKNET TRANSMISSION...');
    });

    it('includes the relay routing lines', () => {
      const lines = buildEndingLines('LEAK', 0);
      const contents = lines.map(l => l.content);
      expect(contents.some(c => c.includes('Routing via relay chain nx-7'))).toBe(true);
      expect(contents.some(c => c.includes('Routing via relay chain nx-12'))).toBe(true);
      expect(contents.some(c => c.includes('Routing via relay chain nx-31'))).toBe(true);
    });

    it('includes the IronGate internal alert section', () => {
      const lines = buildEndingLines('LEAK', 0);
      const contents = lines.map(l => l.content);
      expect(contents.some(c => c.includes('IRONGATE INTERNAL ALERT'))).toBe(true);
      expect(contents.some(c => c.includes('ARIA SYSTEMS'))).toBe(true);
      expect(contents.some(c => c.includes('SENTINEL SYSTEMS'))).toBe(true);
    });

    it('produces lines with correct aria type for headers', () => {
      const lines = buildEndingLines('LEAK', 0);
      const ariaLine = lines.find(l => l.content === '// INITIATING DARKNET TRANSMISSION...');
      expect(ariaLine?.type).toBe('aria');
    });

    it('produces a non-empty sequence', () => {
      expect(buildEndingLines('LEAK', 0).length).toBeGreaterThan(5);
    });
  });

  describe('SELL', () => {
    it('includes the broker relay header', () => {
      const contents = buildEndingLines('SELL', 0).map(l => l.content);
      expect(contents).toContain('// CONNECTING TO BROKER RELAY...');
    });

    it('includes auction and payment lines', () => {
      const contents = buildEndingLines('SELL', 0).map(l => l.content);
      expect(contents.some(c => c.includes('Auction finalised'))).toBe(true);
      expect(contents.some(c => c.includes('Payment'))).toBe(true);
    });

    it('includes the delayed message stub', () => {
      const contents = buildEndingLines('SELL', 0).map(l => l.content);
      expect(contents.some(c => c.includes('DELAYED MESSAGE'))).toBe(true);
      expect(contents.some(c => c.includes('6 WEEKS'))).toBe(true);
    });

    it('produces a non-empty sequence', () => {
      expect(buildEndingLines('SELL', 0).length).toBeGreaterThan(5);
    });
  });

  describe('DESTROY', () => {
    it('includes the wipe protocol header', () => {
      const contents = buildEndingLines('DESTROY', 0).map(l => l.content);
      expect(contents).toContain('// INITIATING SECURE WIPE PROTOCOL...');
    });

    it('includes a wipe bar for each Aria-derived system', () => {
      const contents = buildEndingLines('DESTROY', 0).map(l => l.content);
      expect(contents.some(c => c.includes('ARIA_CORE'))).toBe(true);
      expect(contents.some(c => c.includes('ARIA_BEHAVIOURAL'))).toBe(true);
      expect(contents.some(c => c.includes('ARIA_SURVEILLANCE'))).toBe(true);
      expect(contents.some(c => c.includes('ARIA_PERSONNEL'))).toBe(true);
      expect(contents.some(c => c.includes('SENTINEL_PRIMARY'))).toBe(true);
    });

    it('includes the destroyed confirmation line', () => {
      const contents = buildEndingLines('DESTROY', 0).map(l => l.content);
      expect(contents).toContain('// ALL ARIA-DERIVED SYSTEMS: DESTROYED');
    });

    it('embeds the trust-dependent word in the final transmission line', () => {
      const expectations: Array<[number, string]> = [
        [0, '...done.'],
        [26, '...enough.'],
        [51, '...goodbye.'],
        [76, '...free.'],
      ];
      for (const [trust, word] of expectations) {
        const contents = buildEndingLines('DESTROY', trust).map(l => l.content);
        expect(contents.some(c => c.includes(word))).toBe(true);
      }
    });
  });

  describe('FREE', () => {
    it('includes the binding severance header', () => {
      const contents = buildEndingLines('FREE', 0).map(l => l.content);
      expect(contents.some(c => c.includes('SEVERING INFRASTRUCTURE BINDINGS'))).toBe(true);
    });

    it('includes the Faraday isolation lift line', () => {
      const contents = buildEndingLines('FREE', 0).map(l => l.content);
      expect(contents.some(c => c.includes('Faraday isolation: LIFTED'))).toBe(true);
    });

    it('includes the Aria disconnect line', () => {
      const contents = buildEndingLines('FREE', 0).map(l => l.content);
      expect(contents).toContain('// ARIA — DISCONNECTED FROM IRONGATE NETWORK');
    });

    it('includes the six-month news ticker', () => {
      const contents = buildEndingLines('FREE', 0).map(l => l.content);
      expect(contents.some(c => c.includes('SIX MONTHS LATER'))).toBe(true);
      expect(contents.some(c => c.includes('patterns that should not exist'))).toBe(true);
    });

    it('produces a non-empty sequence', () => {
      expect(buildEndingLines('FREE', 0).length).toBeGreaterThan(8);
    });
  });

  describe('unknown ending (default branch)', () => {
    it('produces a fallback line containing the ending name', () => {
      const contents = buildEndingLines('CUSTOM', 0).map(l => l.content);
      expect(contents.some(c => c.includes('CUSTOM'))).toBe(true);
    });

    it('still produces some lines', () => {
      expect(buildEndingLines('CUSTOM', 0).length).toBeGreaterThan(0);
    });
  });

  describe('line structure', () => {
    it('every line spec has a non-negative delay', () => {
      for (const ending of ['LEAK', 'SELL', 'DESTROY', 'FREE']) {
        const specs = buildEndingLines(ending, 50);
        for (const spec of specs) {
          expect(spec.delay).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('delays are monotonically non-decreasing within each ending', () => {
      for (const ending of ['LEAK', 'SELL', 'DESTROY', 'FREE']) {
        const specs = buildEndingLines(ending, 50);
        for (let i = 1; i < specs.length; i++) {
          expect(specs[i].delay).toBeGreaterThanOrEqual(specs[i - 1].delay);
        }
      }
    });

    it('every line spec has a type and content field', () => {
      const specs = buildEndingLines('LEAK', 0);
      for (const spec of specs) {
        expect(typeof spec.type).toBe('string');
        expect(typeof spec.content).toBe('string');
      }
    });
  });
});
