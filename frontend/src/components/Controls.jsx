import { useState } from "react";

// Date pickers, the choice of decision time, and the lead-time slider.
// The slider only reports its new value when it is released, so dragging it
// doesn't send a request for every hour it passes over. In auction mode the
// slider is disabled, because every hour is decided at the auction instead.
export default function Controls({
  start,
  end,
  mode,
  leadHours,
  firstDay,
  lastDay,
  onStartChange,
  onEndChange,
  onModeChange,
  onLeadHoursChange,
}) {
  // The value shown while dragging. It is passed up to App only on release.
  const [draftLead, setDraftLead] = useState(leadHours);
  const auction = mode === "auction";

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
      <fieldset className="mode">
        <legend>Decision time</legend>
        <label>
          <input type="radio" name="mode" value="lead" checked={!auction} onChange={() => onModeChange("lead")} />
          Fixed lead time
        </label>
        <label>
          <input type="radio" name="mode" value="auction" checked={auction} onChange={() => onModeChange("auction")} />
          Day-ahead auction (09:50 the day before)
        </label>
      </fieldset>
      <label className="slider">
        {auction ? (
          <span>Each hour uses the forecast available at 09:50 UTC the day before</span>
        ) : (
          <span>
            Forecast made at least <strong>{draftLead} h</strong> before delivery
          </span>
        )}
        <input
          type="range"
          min="1"
          max="48"
          step="1"
          value={draftLead}
          disabled={auction}
          onChange={(e) => setDraftLead(Number(e.target.value))}
          onPointerUp={commitLead}
          onKeyUp={commitLead}
        />
      </label>
    </section>
  );
}
