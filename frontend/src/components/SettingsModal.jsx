import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, Download01Icon, Delete02Icon } from '@hugeicons/core-free-icons';
import SpringCheck from './SpringCheck';

const TOGGLES = [
  { key: 'showReasoning', label: 'Show reasoning', hint: 'Display the model’s thinking in a collapsible panel.' },
  { key: 'autoScroll', label: 'Auto-scroll while replying', hint: 'Follow new text as it streams in.' },
  { key: 'webSearch', label: 'Web search', hint: 'Look things up live for each message. Needs SERP_API_KEY on the server.' },
  { key: 'sparks', label: 'Sparks at max effort', hint: 'Gold particles in the prompt bar on Max.' },
  { key: 'reduceMotion', label: 'Reduce motion', hint: 'Calmer animations everywhere.' }
];

export default function SettingsModal({ open, settings, onChange, onClose, onExport, onClearAll, chatCount, info }) {
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!open) setConfirm(false);
    const onKey = e => e.key === 'Escape' && onClose();
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div className="modal-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onMouseDown={e => e.target === e.currentTarget && onClose()}>
          <motion.div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
          >
            <header className="modal__head">
              <h2>Settings</h2>
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Close settings">
                <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.8} />
              </button>
            </header>

            <div className="modal__body">
              <section>
                <h3>Preferences</h3>
                <div className="toggles">
                  {TOGGLES.map(t => (
                    <div className="toggle" key={t.key}>
                      <SpringCheck
                        label={t.label}
                        checked={Boolean(settings[t.key])}
                        onChange={v => onChange({ [t.key]: v })}
                        color="#efe9df"
                        fillColor="#d4af6a"
                        checkColor="#17130d"
                        boxSize={22}
                        boxRadius={7}
                        fontSize={15}
                        strike="none"
                        doneOpacity={1}
                      />
                      <p>{t.hint}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3>Custom instructions</h3>
                <textarea
                  className="field"
                  rows={4}
                  maxLength={2000}
                  placeholder="e.g. Answer in plain English. Keep answers short. Explain code step by step."
                  value={settings.instructions}
                  onChange={e => onChange({ instructions: e.target.value })}
                />
                <p className="hint">Sent with every message so Thinko answers the way you like.</p>
              </section>

              <section>
                <h3>Model</h3>
                <div className="infocard">
                  <div>
                    <span>Active model</span>
                    <strong>{info?.model ? `NVIDIA Auto (${info.model.split('/').pop()})` : 'NVIDIA Auto'}</strong>
                  </div>
                  <div>
                    <span>Server</span>
                    <strong data-ok={info ? (info.key_set ? 'yes' : 'no') : undefined}>
                      {info ? (info.key_set ? 'Connected' : 'NVIDIA key missing') : 'Checking…'}
                    </strong>
                  </div>
                </div>
              </section>

              <section>
                <h3>Your data</h3>
                <p className="hint">Chats are stored in this browser only. {chatCount} saved.</p>
                <div className="row">
                  <button type="button" className="btn" onClick={onExport} disabled={!chatCount}>
                    <HugeiconsIcon icon={Download01Icon} size={16} strokeWidth={1.8} />
                    Export JSON
                  </button>
                  {confirm ? (
                    <button
                      type="button"
                      className="btn btn--danger"
                      onClick={() => {
                        onClearAll();
                        setConfirm(false);
                      }}
                    >
                      Yes, delete everything
                    </button>
                  ) : (
                    <button type="button" className="btn btn--ghost" onClick={() => setConfirm(true)} disabled={!chatCount}>
                      <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.8} />
                      Delete all chats
                    </button>
                  )}
                </div>
              </section>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
