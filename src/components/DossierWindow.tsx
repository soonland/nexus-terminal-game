import type { Dossier } from '../types/dossier';

interface Props {
  dossier: Dossier;
}

export const DossierWindow = ({ dossier }: Props) => (
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
      <strong>Aria memory</strong>
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
