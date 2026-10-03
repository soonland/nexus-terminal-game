// PR 1 placeholder: the NEXUS line is the only channel. Scripted messages arrive in a
// later PR; Sentinel/Aria tabs are added when those channels open.
export const CommsPane = () => (
  <div className="comms">
    <div className="comms-line">NEXUS // ENCRYPTED LINE</div>
    <div className="comms-empty">line open — no traffic</div>
  </div>
);
