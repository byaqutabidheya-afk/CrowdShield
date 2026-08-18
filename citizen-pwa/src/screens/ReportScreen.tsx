import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAppStore } from '../store/appStore';
import { getTranslation } from '../i18n/translations';

export default function ReportScreen() {
  const { selectedLanguage, userLocation, clientDeviceId } = useAppStore();
  const [notes, setNotes] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const [myReports, setMyReports] = useState<any[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(true);

  const fetchMyReports = async () => {
    try {
      setIsLoadingReports(true);
      const url = import.meta.env.VITE_BACKEND_HTTP_URL || 'http://localhost:8000/api';
      const res = await axios.get(`${url}/incidents`, {
        params: { client_device_id: clientDeviceId }
      });
      setMyReports(res.data || []);
    } catch (e) {
      console.error('Failed to fetch my reports', e);
    } finally {
      setIsLoadingReports(false);
    }
  };

  useEffect(() => {
    if (clientDeviceId) {
      fetchMyReports();
    }
  }, [clientDeviceId]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedPhoto(e.target.files[0]);
    }
  };

  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('No canvas context');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Compress client-side to keep submissions fast on conference WiFi
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject('Blob creation failed');
          },
          'image/jpeg',
          0.7 
        );
      };
      img.onerror = (err) => reject(err);
    });
  };

  const handleSubmit = async () => {
    if (!notes.trim() && !selectedPhoto) return;
    setIsSubmitting(true);
    setSubmitError(false);

    try {
      if (selectedPhoto) {
        const compressedBlob = await compressImage(selectedPhoto);
        console.log(`[Compression] Original: ${(selectedPhoto.size/1024).toFixed(1)}KB, Compressed: ${(compressedBlob.size/1024).toFixed(1)}KB`);
      }

      const url = import.meta.env.VITE_BACKEND_HTTP_URL || 'http://localhost:8000/api';
      await axios.post(`${url}/incidents`, {
        source: 'citizen',
        gps_coordinates: userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null,
        notes: notes.trim(),
        client_device_id: clientDeviceId,
      });

      setSubmitSuccess(true);
      setNotes('');
      setSelectedPhoto(null);
      setTimeout(() => setSubmitSuccess(false), 3000);
      fetchMyReports();
    } catch (e) {
      console.error('Failed to submit report', e);
      setSubmitError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingBottom: '16px' }}>
      <h1 style={{ margin: '0 0 1rem 0' }}>{getTranslation(selectedLanguage, 'reportIncident')}</h1>
      
      {submitSuccess && (
        <div style={{
          padding: '12px',
          background: 'rgba(52, 211, 153, 0.15)',
          color: '#10b981',
          borderRadius: '8px',
          marginBottom: '16px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>✓</span> {getTranslation(selectedLanguage, 'reportSuccess')}
        </div>
      )}

      {submitError && (
        <div style={{
          padding: '12px',
          background: 'rgba(239, 68, 68, 0.15)',
          color: '#ef4444',
          borderRadius: '8px',
          marginBottom: '16px',
          fontWeight: 600,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚠️</span> {getTranslation(selectedLanguage, 'reportError')}
          </div>
          <button 
             onClick={handleSubmit}
             style={{
               background: '#ef4444',
               color: 'white',
               border: 'none',
               padding: '10px',
               borderRadius: '6px',
               fontWeight: 600,
               cursor: 'pointer',
               alignSelf: 'flex-start',
               fontSize: '0.875rem'
             }}
          >
             {getTranslation(selectedLanguage, 'retry')}
          </button>
        </div>
      )}

      <div style={{
        flex: 1,
        background: '#09101d', // Match app theme
        borderRadius: '12px',
        border: '1px solid var(--border-color)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        overflowY: 'auto',
        opacity: isSubmitting ? 0.6 : 1,
        pointerEvents: isSubmitting ? 'none' : 'auto'
      }}>
        {/* GPS Location (Read-only) */}
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', color: '#cbd5e1', marginBottom: '8px', fontWeight: 600 }}>
            GPS Location (Auto-captured)
          </label>
          <div style={{
            padding: '14px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            color: userLocation ? '#e2e8f0' : '#94a3b8',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ color: userLocation ? '#3b82f6' : 'inherit' }}>📍</span>
            {userLocation 
              ? `${userLocation.lat.toFixed(6)}, ${userLocation.lng.toFixed(6)}` 
              : 'Acquiring GPS...'}
          </div>
        </div>

        {/* Photo Upload */}
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', color: '#cbd5e1', marginBottom: '8px', fontWeight: 600 }}>
            Photo Evidence
          </label>
          <div style={{ display: 'flex', gap: '12px' }}>
            <label style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px 8px',
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px dashed rgba(59, 130, 246, 0.5)',
              borderRadius: '8px',
              cursor: 'pointer',
              color: '#60a5fa',
              fontWeight: 600,
              fontSize: '0.875rem',
              gap: '8px',
              textAlign: 'center',
              transition: 'all 0.2s ease'
            }}>
              <span style={{ fontSize: '1.5rem' }}>📷</span>
              {getTranslation(selectedLanguage, 'takePhoto')}
              {/* capture="environment" forces the rear camera on mobile */}
              <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                onChange={handlePhotoSelect}
                style={{ display: 'none' }} 
              />
            </label>
            <label style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px 8px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px dashed rgba(255, 255, 255, 0.2)',
              borderRadius: '8px',
              cursor: 'pointer',
              color: '#cbd5e1',
              fontWeight: 600,
              fontSize: '0.875rem',
              gap: '8px',
              textAlign: 'center',
              transition: 'all 0.2s ease'
            }}>
              <span style={{ fontSize: '1.5rem' }}>🖼️</span>
              {getTranslation(selectedLanguage, 'chooseFromGallery')}
              <input 
                type="file" 
                accept="image/*" 
                onChange={handlePhotoSelect}
                style={{ display: 'none' }} 
              />
            </label>
          </div>
          {selectedPhoto && (
            <div style={{ 
              marginTop: '12px', 
              fontSize: '0.875rem', 
              color: '#34d399',
              background: 'rgba(52, 211, 153, 0.1)',
              padding: '8px 12px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>✓</span> {selectedPhoto.name}
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', color: '#cbd5e1', marginBottom: '8px', fontWeight: 600 }}>
            {getTranslation(selectedLanguage, 'notes')}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe the incident..."
            rows={5}
            style={{
              width: '100%',
              padding: '14px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              color: '#e2e8f0',
              fontFamily: 'inherit',
              fontSize: '0.95rem',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={(!notes.trim() && !selectedPhoto) || isSubmitting}
          style={{
            padding: '16px',
            background: (!notes.trim() && !selectedPhoto) ? 'rgba(255,255,255,0.1)' : 'var(--primary-color)',
            color: (!notes.trim() && !selectedPhoto) ? '#94a3b8' : 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: 700,
            cursor: (!notes.trim() && !selectedPhoto) ? 'not-allowed' : 'pointer',
            boxShadow: (!notes.trim() && !selectedPhoto) ? 'none' : '0 4px 12px rgba(139, 92, 246, 0.3)',
            marginTop: '8px',
            transition: 'all 0.2s ease'
          }}
        >
          {isSubmitting ? 'Submitting...' : getTranslation(selectedLanguage, 'submit')}
        </button>

        {/* My Reports Section */}
        <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--border-color)' }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '1.125rem', color: '#e2e8f0' }}>
            {getTranslation(selectedLanguage, 'myReports')}
          </h2>
          
          {isLoadingReports ? (
            <div style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Loading...</div>
          ) : myReports.length === 0 ? (
            <div style={{ 
              padding: '24px', 
              textAlign: 'center', 
              background: 'rgba(255, 255, 255, 0.02)', 
              borderRadius: '8px',
              color: '#94a3b8',
              fontSize: '0.875rem'
            }}>
              {getTranslation(selectedLanguage, 'noReportsYet')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {myReports.map((report: any) => (
                <div key={report.id} style={{
                  padding: '16px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      {new Date(report.submitted_at).toLocaleString()}
                    </span>
                    <span style={{
                      fontSize: '0.7rem',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: report.ai_summary ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                      color: report.ai_summary ? '#10b981' : '#3b82f6',
                      fontWeight: 600,
                      textTransform: 'uppercase'
                    }}>
                      {report.ai_summary ? 'Reviewed' : 'Received'}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                    {report.notes || 'Photo submission'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
