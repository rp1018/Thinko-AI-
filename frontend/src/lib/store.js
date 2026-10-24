// Chats and settings live in the browser (per account), so the server stays stateless
// and nothing is lost when Render restarts.

const KEY = uid => `thinko:v2:chats:${uid}`;
const SETTINGS_KEY = 'thinko:v2:settings';

export const DEFAULT_SETTINGS = {
  showReasoning: true,
  autoScroll: true,
  webSearch: false,
  sparks: true,
  reduceMotion: false,
  instructions: '',
  effort: 'High'
};

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked, the app still works for this session */
  }
};

export const loadChats = uid => {
  const chats = read(KEY(uid), []);
  return Array.isArray(chats) ? chats : [];
};
export const saveChats = (uid, chats) => write(KEY(uid), chats);

export const loadSettings = () => ({ ...DEFAULT_SETTINGS, ...read(SETTINGS_KEY, {}) });
export const saveSettings = s => write(SETTINGS_KEY, s);

export const uid = () =>
  (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export const makeChat = () => ({ id: uid(), title: 'New chat', createdAt: Date.now(), updatedAt: Date.now(), messages: [] });

export const titleFrom = text => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 44 ? `${t.slice(0, 42).trim()}…` : t || 'New chat';
};

// Today / Yesterday / Previous 7 days / Older — used by the sidebar tree
export const groupChats = chats => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const day = 86400000;
  const buckets = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 days', items: [] },
    { label: 'Older', items: [] }
  ];
  [...chats]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach(c => {
      const age = startOfDay.getTime() - c.updatedAt;
      if (age < 0) buckets[0].items.push(c);
      else if (age < day) buckets[1].items.push(c);
      else if (age < day * 7) buckets[2].items.push(c);
      else buckets[3].items.push(c);
    });
  return buckets.filter(b => b.items.length);
};

export const exportChats = chats => {
  const blob = new Blob([JSON.stringify(chats, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `thinko-chats-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
