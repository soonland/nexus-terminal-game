interface Props {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
}

export const SuggestionBar = ({ suggestions, onSelect }: Props) => {
  if (suggestions.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.75rem',
        padding: '0.2rem 1.5rem',
        borderTop: '1px solid var(--color-border)',
      }}>
      {suggestions.map((s, i) => (
        <button
          key={s}
          onClick={e => {
            e.stopPropagation();
            onSelect(s);
          }}
          style={{
            background: 'var(--color-system)',
            border: 'none',
            color: '#000000',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size)',
            padding: '0 0.4rem',
            cursor: 'pointer',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-error)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-system)';
          }}>
          <span
            style={{ color: 'var(--color-bg)', marginRight: '0.3rem' }}>{`F${String(i + 1)}`}</span>
          {s}
        </button>
      ))}
    </div>
  );
};
