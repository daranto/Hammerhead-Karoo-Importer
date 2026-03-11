import React, { useRef, useState, useCallback } from 'react';
import { useT } from '../i18n/I18nContext.jsx';
import { apiFetch } from '../utils/apiFetch.js';
import styles from './UploadDropzone.module.css';

export default function UploadDropzone({ onSuccess }) {
  const { t } = useT();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const uploadFile = useCallback(async (file) => {
    const name = file?.name?.toLowerCase() ?? '';
    if (!file || (!name.endsWith('.fit') && !name.endsWith('.gpx'))) {
      setError(t('upload.invalidFile'));
      return;
    }

    setUploading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await apiFetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('upload.failed'));
      setResult(data);
      onSuccess?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }, [onSuccess, t]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  const onChange = useCallback((e) => {
    const file = e.target.files[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  return (
    <div
      className={`${styles.zone} ${dragging ? styles.dragging : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept=".fit,.gpx" onChange={onChange} className={styles.input} />

      {uploading ? (
        <div className={styles.uploading}>
          <div className={styles.spinner} />
          <span>{t('upload.uploading')}</span>
        </div>
      ) : result ? (
        <div className={styles.success}>
          <span>✓ {result.name}</span>
          <span className={styles.sub}>{t('upload.records', { n: result.recordCount })}</span>
        </div>
      ) : (
        <>
          <div className={styles.icon}>
            <svg viewBox="0 0 40 40" width="40" height="40" fill="none">
              <path d="M20 8v16M13 15l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 30h24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div className={styles.text}>
            <span>{t('upload.drop')}</span>
            <span className={styles.sub}>{t('upload.tap')}</span>
          </div>
        </>
      )}

      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}
