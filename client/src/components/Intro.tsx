import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Logo } from './ui';
import { trackEvent } from '../lib/api';
import { sfx } from '../lib/sound';

const KEY = 'pz-intro-seen';

/** ~2.4s brand sting on first visit only. Skippable; never shown again once seen; skipped for reduced motion. */
export function Intro() {
  const [show, setShow] = useState(() => {
    try { return !localStorage.getItem(KEY) && !matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  });
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => done(false), 2600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);
  const done = (skipped: boolean) => {
    try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    if (skipped) trackEvent('intro_skipped');
    setShow(false);
  };
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="intro" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.5 } }} onClick={() => sfx.tap()}>
          <motion.div initial={{ scale: 0.2, opacity: 0, rotate: -90 }} animate={{ scale: [0.2, 1.25, 1], opacity: 1, rotate: 0 }} transition={{ duration: 1.1, ease: [0.34, 1.56, 0.64, 1] }}
            style={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', background: 'conic-gradient(from 0deg, #ff3d8b, #ff7a3d, #ffb02e, #3dd9ff, #8b5cff, #ff3d8b)', filter: 'blur(40px)', opacity: 0.55 }} />
          <div style={{ textAlign: 'center', position: 'relative' }}>
            <motion.div initial={{ y: 30, opacity: 0, letterSpacing: '0.4em' }} animate={{ y: 0, opacity: 1, letterSpacing: '-0.03em' }} transition={{ delay: 0.35, duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}>
              <Logo size={64} />
            </motion.div>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.05, duration: 0.6 }} style={{ marginTop: 18, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>
              Aaja <span className="grad-text">PLAYZO</span> pe khelte hain!
            </motion.p>
          </div>
          <button className="btn btn-ghost skip" onClick={() => done(true)}>Skip</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
