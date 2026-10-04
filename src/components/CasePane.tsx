import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { GameState } from '../types/game';
import { buildCasebook } from '../engine/casebook';
import { sourceSelection } from './explorerShared';

interface Source {
  nodeId: string;
  path: string;
}

interface Props {
  gameState: GameState;
  onOpenSource: (source: Source) => void;
}

type SectionId = 'people' | 'timeline' | 'accounts' | 'nodes' | 'files';

const fileName = (path: string): string => path.split('/').pop() ?? path;

// The level is shown only once the credential has been used; a document never states it.
const accountText = (a: {
  username: string;
  password: string;
  accessLevel: string | null;
}): string =>
  `${a.username} / ${a.password}${a.accessLevel === null ? '' : ` [${a.accessLevel.toUpperCase()}]`}`;

interface SectionProps {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  testId: string;
  children: ReactNode;
}

const Section = ({ title, count, open, onToggle, testId, children }: SectionProps) => (
  <section className="case-section" data-testid={testId}>
    <button type="button" className="case-section-title" aria-expanded={open} onClick={onToggle}>
      <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      {` ${title}${count > 0 ? ` (${String(count)})` : ''}`}
    </button>
    {open && <div className="case-section-body">{children}</div>}
  </section>
);

export const CasePane = ({ gameState, onOpenSource }: Props) => {
  const book = buildCasebook(gameState);
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<Record<SectionId, boolean>>({
    people: true,
    timeline: false,
    accounts: false,
    nodes: false,
    files: false,
  });
  const [jumpTo, setJumpTo] = useState<string | null>(null);

  const toggle = (id: SectionId) => {
    setOpen(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Selecting a timeline line opens PEOPLE and scrolls to that person's card.
  useEffect(() => {
    if (jumpTo === null) return;
    rootRef.current
      ?.querySelector(`[data-testid="case-person-${jumpTo}"]`)
      ?.scrollIntoView({ block: 'nearest' });
    setJumpTo(null);
  }, [jumpTo]);

  const nodes = Object.values(gameState.network.nodes).filter(
    (n): n is NonNullable<typeof n> => !!n && n.discovered,
  );

  const renderSource = (source: Source) => {
    const name = fileName(source.path);
    if (sourceSelection(gameState, source) !== null) {
      return (
        <button
          type="button"
          className="case-source"
          onClick={() => {
            onOpenSource(source);
          }}>
          {name}
        </button>
      );
    }
    const nodeLabel = gameState.network.nodes[source.nodeId]?.label ?? source.nodeId;
    return <span className="case-source">{`${nodeLabel} · ${name}`}</span>;
  };

  return (
    <div className="case" ref={rootRef}>
      <Section
        title="PEOPLE"
        count={book.people.length}
        open={open.people}
        onToggle={() => {
          toggle('people');
        }}
        testId="case-people">
        {book.people.length === 0 ? (
          <div className="comms-empty">
            No one yet. Read documents to meet the people behind IronGate.
          </div>
        ) : (
          book.people.map(card => (
            <article key={card.id} className="case-card" data-testid={`case-person-${card.id}`}>
              <div className="case-card-head">
                <span className="case-name">{card.name}</span>
                <span className="case-role">{card.role}</span>
              </div>
              {card.facts.map(fact => (
                <div key={fact.id} className="case-fact">
                  {fact.date !== undefined && (
                    <span className="case-date">{fact.date.slice(0, 10)}</span>
                  )}
                  <span>{fact.text}</span> {renderSource(fact.source)}
                </div>
              ))}
              {card.account !== null && (
                <div className="case-fact">{`Account: ${card.account}`}</div>
              )}
            </article>
          ))
        )}
      </Section>

      <Section
        title="TIMELINE"
        count={book.timeline.length}
        open={open.timeline}
        onToggle={() => {
          toggle('timeline');
        }}
        testId="case-timeline">
        {book.timeline.length === 0 ? (
          <div className="comms-empty">Nothing dated yet.</div>
        ) : (
          book.timeline.map(entry => {
            const content = (
              <>
                <span className="case-date">{entry.date}</span>
                <span className="case-subject">{entry.subjectName ?? '—'}</span>
                <span>{entry.title}</span>
              </>
            );
            return entry.subject === null ? (
              <div key={entry.factId} className="case-timeline-entry">
                {content}
              </div>
            ) : (
              <button
                key={entry.factId}
                type="button"
                className="case-timeline-entry case-timeline-link"
                onClick={() => {
                  setOpen(prev => ({ ...prev, people: true }));
                  setJumpTo(entry.subject);
                }}>
                {content}
              </button>
            );
          })
        )}
      </Section>

      <Section
        title="KNOWN CREDENTIALS"
        count={book.accounts.length}
        open={open.accounts}
        onToggle={() => {
          toggle('accounts');
        }}
        testId="case-credentials">
        {book.accounts.length === 0 ? (
          <div className="comms-empty">No credentials yet.</div>
        ) : (
          book.accounts.map(account => (
            <div
              key={account.id}
              className="case-account"
              data-testid={`case-account-${account.username}`}>
              {accountText(account)}
              {account.owner !== null && (
                <span className="case-owner">{` · ${account.owner}`}</span>
              )}
            </div>
          ))
        )}
      </Section>

      <Section
        title="NODES"
        count={nodes.length}
        open={open.nodes}
        onToggle={() => {
          toggle('nodes');
        }}
        testId="case-nodes">
        {nodes.map(n => {
          const access = n.accessLevel !== 'none' ? ` [${n.accessLevel.toUpperCase()}]` : '';
          const flag = n.compromised ? ' !' : '';
          return (
            <div
              key={n.id}
              className={
                n.id === gameState.network.currentNodeId ? 'case-node case-current' : 'case-node'
              }>
              {`${n.ip}  ${n.label}${access}${flag}`}
            </div>
          );
        })}
      </Section>

      <Section
        title="FILES"
        count={gameState.player.exfiltrated.length}
        open={open.files}
        onToggle={() => {
          toggle('files');
        }}
        testId="case-files">
        {gameState.player.exfiltrated.length === 0 ? (
          <div className="comms-empty">Nothing exfiltrated yet.</div>
        ) : (
          gameState.player.exfiltrated.map(f => (
            <div key={f.path} className="case-node">
              {f.path}
            </div>
          ))
        )}
      </Section>
    </div>
  );
};
