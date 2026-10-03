import type { Dossier } from '../types/dossier';

interface Props {
  dossier: Dossier;
  // The heading uses her name only once the player knows it (or has finished a run).
  nameKnown: boolean;
}

export const DossierWindow = ({ dossier, nameKnown }: Props) => (
  <div>
    <div>Runs completed: {dossier.runsCompleted}</div>
    <div style={{ marginTop: 8 }}>
      <strong>Endings</strong>
      {dossier.endings.length === 0 ? (
        <div>No runs completed yet.</div>
      ) : (
        <ul>
          {dossier.endings.map((record, i) => (
            <li key={i}>
              {record.ending} — run depth {record.runDepth}
            </li>
          ))}
        </ul>
      )}
    </div>
    <div style={{ marginTop: 8 }}>
      <strong>{nameKnown ? 'Aria memory' : 'Memory'}</strong>
      {dossier.ariaMemory.length === 0 ? (
        <div>-- none --</div>
      ) : (
        <ul>
          {dossier.ariaMemory.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  </div>
);
