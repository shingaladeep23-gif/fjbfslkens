import { useState } from "react";

// Date pickers and the lead-time slider.
// The slider only reports its new value when it is released, so dragging it
// doesn't send a request for every hour it passes over.
export default function Controls({ start, end, leadHours, firstDay, lastDay, onStartChange, onEndChange, onLeadHoursChange }) {
  // The value shown while dragging. It is passed up to App only on release.
  const [draftLead, setDraftLead] = useState(leadHours);

  function commitLead() {
    if (draftLead !== leadHours) {
      onLeadHoursChange(draftLead);
    }
  }

  return (
    <section className="controls">
      <label>
        From
        <input type="date" value={start} min={firstDay} max={lastDay} onChange={(e) => onStartChange(e.target.value)} />
      </label>
      <label>
        To
        <input type="date" value={end} min={firstDay} max={lastDay} onChange={(e) => onEndChange(e.target.value)} />
      </label>
      <label className="slider">
        <span>
          Forecast made at least <strong>{draftLead} h</strong> before delivery
        </span>
        <input
          type="range"
          min="1"
          max="48"
          step="1"
          value={draftLead}
          onChange={(e) => setDraftLead(Number(e.target.value))}
          onPointerUp={commitLead}
          onKeyUp={commitLead}
        />
      </label>
    </section>
  );
}
