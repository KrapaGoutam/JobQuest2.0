import { useId, useMemo, useState } from 'react';
import { Select } from '../ui/Select';
import { supportedTimeZones, zoneLabel } from '../../lib/time';

/**
 * "Times are in America/Chicago (CDT), your profile time zone. Change" (I3 help text).
 * Changing it updates profiles.timezone, which every interview view renders in.
 */
export function TimeZoneNote({
  timeZone,
  onChange,
  at,
}: {
  timeZone: string;
  onChange: (zone: string) => Promise<void>;
  at?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const zones = useMemo(() => supportedTimeZones(timeZone), [timeZone]);

  if (!editing) {
    return (
      <div className="help" id={`${id}-tz`}>
        Times are in <b data-testid="profile-timezone">{zoneLabel(timeZone, at)}</b>, your profile time zone.{' '}
        <button type="button" className="linkish" onClick={() => setEditing(true)}>
          Change
        </button>
      </div>
    );
  }
  return (
    <div className="field" style={{ marginTop: 4 }}>
      <label className="label" htmlFor={`${id}-sel`}>
        Profile time zone
      </label>
      <Select
        id={`${id}-sel`}
        value={timeZone}
        onChange={async (e) => {
          setError(null);
          try {
            await onChange(e.target.value);
            setEditing(false);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        {zones.map((z) => (
          <option key={z} value={z}>
            {z.replace(/_/g, ' ')}
          </option>
        ))}
      </Select>
      {error && (
        <div className="ferr" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
