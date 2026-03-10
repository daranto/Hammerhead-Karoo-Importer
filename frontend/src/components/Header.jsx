import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useT } from '../i18n/I18nContext.jsx';
import styles from './Header.module.css';

export default function Header() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { email, removeCredentials } = useAuth();
  const { t, lang, switchLang } = useT();
  const [menuOpen, setMenuOpen]     = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const menuRef = useRef(null);

  const isHome  = pathname === '/' || pathname.startsWith('/activities/');
  const isStats = pathname === '/stats';

  /* Close dropdown on outside click */
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, []);

  const handleLogout = () => {
    setMenuOpen(false);
    if (window.confirm(t('credentials.removeConfirm'))) removeCredentials();
  };

  const openProfile = () => {
    setMenuOpen(false);
    setProfileOpen(true);
  };

  return (
    <>
      <header className={styles.header}>
        <div className={styles.inner}>

          {/* Logo */}
          <button className={styles.logoBtn} onClick={() => navigate('/')} aria-label="Home">
            <svg viewBox="0 0 32 32" width="26" height="26" fill="none">
              <circle cx="16" cy="16" r="16" fill="#e05c2a"/>
              <path d="M9 23V9h4v5h6V9h4v14h-4v-5h-6v5z" fill="white"/>
            </svg>
          </button>

          {/* Nav links */}
          <nav className={styles.nav}>
            <button
              className={`${styles.navLink} ${isHome ? styles.navActive : ''}`}
              onClick={() => navigate('/')}
            >
              {t('header.myRides')}
            </button>
            <button
              className={`${styles.navLink} ${isStats ? styles.navActive : ''}`}
              onClick={() => navigate('/stats')}
            >
              {t('stats.title')}
            </button>
          </nav>

          {/* User menu */}
          <div className={styles.userArea} ref={menuRef}>
            <button
              className={`${styles.userBtn} ${menuOpen ? styles.userBtnOpen : ''}`}
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={t('header.account')}
            >
              <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
                <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M3 17c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <svg viewBox="0 0 10 6" width="9" height="6" fill="none" className={menuOpen ? styles.chevronUp : ''}>
                <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {menuOpen && (
              <div className={styles.dropdown}>
                {email && (
                  <div className={styles.dropEmail}>{email}</div>
                )}
                <div className={styles.dropDivider}/>
                <button className={styles.dropItem} onClick={openProfile}>
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                    <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M2.5 13.5c0-3.038 2.462-5.5 5.5-5.5s5.5 2.462 5.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  {t('header.profile')}
                </button>
                <div className={styles.dropDivider}/>
                <div className={styles.dropLang}>
                  <span className={styles.dropLangLabel}>{t('header.language')}</span>
                  <div className={styles.langBtns}>
                    <button
                      className={`${styles.langBtn} ${lang === 'de' ? styles.langActive : ''}`}
                      onClick={() => { switchLang('de'); setMenuOpen(false); }}
                    >DE</button>
                    <button
                      className={`${styles.langBtn} ${lang === 'en' ? styles.langActive : ''}`}
                      onClick={() => { switchLang('en'); setMenuOpen(false); }}
                    >EN</button>
                  </div>
                </div>
                <div className={styles.dropDivider}/>
                <button className={styles.dropLogout} onClick={handleLogout}>
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
                    <path d="M6 14H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M10.5 11l3-3-3-3M13.5 8H6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {t('header.signOut')}
                </button>
              </div>
            )}
          </div>

        </div>
      </header>

      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} t={t} />}
    </>
  );
}

function ProfileModal({ onClose, t }) {
  const [weight, setWeight] = useState('');
  const [age, setAge]       = useState('');
  const [gender, setGender] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState(null);

  useEffect(() => {
    fetch('/api/profile', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (data.weight_kg != null) setWeight(String(data.weight_kg));
        if (data.age != null)       setAge(String(data.age));
        if (data.gender)            setGender(data.gender);
      })
      .catch(() => {});
  }, []);

  /* Close on Escape */
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const body = {};
      if (weight !== '') body.weight_kg = parseFloat(weight);
      if (age !== '')    body.age       = parseInt(age, 10);
      if (gender !== '') body.gender    = gender;

      const res = await fetch('/api/profile', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Unknown error');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{t('profile.title')}</h2>
          <button className={styles.modalClose} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 14 14" width="14" height="14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <p className={styles.modalHint}>{t('profile.hint')}</p>
        <form className={styles.profileForm} onSubmit={handleSubmit}>
          <div className={styles.profileField}>
            <label className={styles.profileLabel}>{t('profile.weight')}</label>
            <div className={styles.profileInputRow}>
              <input
                type="number"
                className={styles.profileInput}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                min="1" max="500" step="0.1"
                placeholder="70"
              />
              <span className={styles.profileUnit}>{t('profile.weightUnit')}</span>
            </div>
          </div>
          <div className={styles.profileField}>
            <label className={styles.profileLabel}>{t('profile.age')}</label>
            <input
              type="number"
              className={styles.profileInput}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              min="1" max="120" step="1"
              placeholder="30"
            />
          </div>
          <div className={styles.profileField}>
            <label className={styles.profileLabel}>{t('profile.gender')}</label>
            <div className={styles.radioGroup}>
              <label className={styles.radioLabel}>
                <input type="radio" name="gender" value="male"
                  checked={gender === 'male'} onChange={() => setGender('male')} />
                {t('profile.male')}
              </label>
              <label className={styles.radioLabel}>
                <input type="radio" name="gender" value="female"
                  checked={gender === 'female'} onChange={() => setGender('female')} />
                {t('profile.female')}
              </label>
            </div>
          </div>
          {error && <p className={styles.profileError}>{error}</p>}
          <button type="submit" className={styles.profileSaveBtn} disabled={saving}>
            {saving ? '…' : saved ? t('profile.saved') : t('profile.save')}
          </button>
        </form>
      </div>
    </div>
  );
}
