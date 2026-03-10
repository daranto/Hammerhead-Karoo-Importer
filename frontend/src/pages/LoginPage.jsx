import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useT } from '../i18n/I18nContext.jsx';
import styles from './LoginPage.module.css';

export default function LoginPage() {
  const { checkStatus } = useAuth();
  const { t, lang, switchLang } = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('login.submit'));
      await checkStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.langRow}>
          <button className={lang === 'de' ? styles.langActive : styles.langBtn} onClick={() => switchLang('de')}>DE</button>
          <span className={styles.langSep}>|</span>
          <button className={lang === 'en' ? styles.langActive : styles.langBtn} onClick={() => switchLang('en')}>EN</button>
        </div>

        <div className={styles.logo}>
          <svg viewBox="0 0 40 40" width="52" height="52" fill="none">
            <circle cx="20" cy="20" r="20" fill="#e05c2a" />
            <path d="M12 28V12h5v6h6v-6h5v16h-5v-6h-6v6z" fill="white" />
          </svg>
        </div>
        <h1 className={styles.title}>{t('login.title')}</h1>
        <p className={styles.subtitle}>{t('login.subtitle')}</p>

        {error && <div className={styles.error}>{error}</div>}

        <form className={styles.form} onSubmit={handleLogin}>
          <div className={styles.field}>
            <label className={styles.label}>{t('login.email')}</label>
            <input
              className={styles.input}
              type="email"
              placeholder={t('login.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>{t('login.password')}</label>
            <input
              className={styles.input}
              type="password"
              placeholder={t('login.pwPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <button
            className={styles.submitBtn}
            type="submit"
            disabled={loading || !email || !password}
          >
            {loading ? t('login.submitting') : t('login.submit')}
          </button>
        </form>

        <p className={styles.note}>{t('login.note')}</p>
      </div>
    </div>
  );
}
