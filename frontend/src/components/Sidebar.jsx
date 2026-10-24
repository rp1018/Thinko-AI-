import { useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { PlusSignIcon, Search01Icon, Settings02Icon, Logout01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import BranchedMenu from './BranchedMenu';
import { groupChats } from '../lib/store';

export function BrandMark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#1b1815" stroke="rgba(212,175,106,0.35)" />
      <g fill="#d4af6a">
        <circle cx="9" cy="9" r="2.4" />
        <circle cx="16" cy="9" r="2.4" />
        <circle cx="23" cy="9" r="2.4" />
        <circle cx="16" cy="16" r="2.4" />
        <circle cx="16" cy="23" r="2.4" />
      </g>
    </svg>
  );
}

const clip = (t, n = 26) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

export default function Sidebar({ chats, activeId, user, onNew, onSelect, onSettings, onLogout, onClose }) {
  const [q, setQ] = useState('');

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = term
      ? chats.filter(c => c.title.toLowerCase().includes(term) || c.messages.some(m => (m.display ?? m.content ?? '').toLowerCase().includes(term)))
      : chats;
    return groupChats(list);
  }, [chats, q]);

  const items = useMemo(
    () =>
      groups.map(g => ({
        label: g.label,
        children: g.items.map(c => ({ value: c.id, label: clip(c.title), title: c.title }))
      })),
    [groups]
  );

  const name = user.displayName || user.email?.split('@')[0] || 'Guest';
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <aside className="sidebar">
      <div className="sidebar__top">
        <div className="brand">
          <BrandMark />
          <span>Thinko</span>
        </div>
        <button type="button" className="icon-btn sidebar__close" onClick={onClose} aria-label="Close sidebar">
          <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.8} />
        </button>
      </div>

      <button type="button" className="newchat" onClick={onNew}>
        <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2} />
        New chat
        <kbd>Ctrl K</kbd>
      </button>

      <label className="search">
        <HugeiconsIcon icon={Search01Icon} size={15} strokeWidth={1.8} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search chats" aria-label="Search chats" />
      </label>

      <div className="sidebar__scroll">
        {items.length ? (
          <BranchedMenu
            key={q ? 'search' : 'all'}
            items={items}
            defaultOpen={q ? items.map((_, i) => i) : [0]}
            active={activeId ?? ''}
            onSelect={id => onSelect(id)}
            color="#efe9df"
            accentColor="#d4af6a"
            lineColor="#38322b"
            width={280}
            rowHeight={34}
            fontSize={13.5}
            indent={34}
          />
        ) : (
          <p className="sidebar__empty">{q ? 'No chats match that search.' : 'Your conversations will appear here.'}</p>
        )}
      </div>

      <div className="sidebar__foot">
        <div className="avatar" aria-hidden="true">
          {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : initials}
        </div>
        <div className="who">
          <strong>{name}</strong>
          <span>{user.isGuest ? 'Guest · this device only' : user.email}</span>
        </div>
        <button type="button" className="icon-btn" onClick={onSettings} aria-label="Settings">
          <HugeiconsIcon icon={Settings02Icon} size={18} strokeWidth={1.7} />
        </button>
        <button type="button" className="icon-btn" onClick={onLogout} aria-label={user.isGuest ? 'Leave guest mode' : 'Sign out'}>
          <HugeiconsIcon icon={Logout01Icon} size={18} strokeWidth={1.7} />
        </button>
      </div>
    </aside>
  );
}
