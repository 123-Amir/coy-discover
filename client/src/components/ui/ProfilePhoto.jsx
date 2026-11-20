import { useState } from 'react';
import { initialsOf } from '../../lib/format.js';

/** Profile image with a graceful fallback (initials on a gradient) if the file fails to load. */
export default function ProfilePhoto({ profile, className = '' }) {
  const [failed, setFailed] = useState(false);
  if (failed || !profile.photoUrl) {
    return (
      <div className={`photo-fallback grid place-items-center ${className}`}>
        <span className="font-display text-7xl text-white/70">{initialsOf(profile.name)}</span>
      </div>
    );
  }
  return (
    <img
      src={profile.photoUrl}
      alt={`Photo of ${profile.name}`}
      draggable={false}               /* the browser's native image drag would fight the card drag */
      onError={() => setFailed(true)}
      className={`pointer-events-none select-none object-cover ${className}`}
    />
  );
}
