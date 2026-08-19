import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Camera, 
  Image as ImageIcon,
  Send, 
  CheckCircle2, 
  AlertTriangle, 
  Trash2, 
  Clock, 
  X,
  FileText,
  MapPin
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { getTranslation } from '../i18n/translations';
import { getBackendHttpUrl } from '../services/apiConfig';

const PRESET_TAGS = [
  '🔥 Heavy Bottleneck',
  '🚨 Rapid Crowd Surge',
  '🚧 Blocked Corridor / Exit',
  '⚠️ Medical / Safety Hazard',
  '⚡ Stairwell Overcrowding'
];

export default function ReportScreen() {
  const { selectedLanguage, userLocation, clientDeviceId } = useAppStore();
  const [notes, setNotes] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const [myReports, setMyReports] = useState<any[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);

  const fetchMyReports = async () => {
    try {
      setIsLoadingReports(true);
      const url = getBackendHttpUrl();
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

  const handleDeleteReport = async (reportId: string) => {
    try {
      setDeletingReportId(reportId);
      setMyReports((prev) => prev.filter((r) => r.id !== reportId));
      const url = getBackendHttpUrl();
      await axios.delete(`${url}/incidents/${reportId}`);
    } catch (e) {
      console.error('Failed to delete report', e);
      fetchMyReports();
    } finally {
      setDeletingReportId(null);
    }
  };

  useEffect(() => {
    if (clientDeviceId) {
      fetchMyReports();
    }
  }, [clientDeviceId]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setSelectedPhoto(file);
      const previewUrl = URL.createObjectURL(file);
      setPhotoPreview(previewUrl);
    }
  };

  const handleRemovePhoto = () => {
    setSelectedPhoto(null);
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
      setPhotoPreview(null);
    }
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (readerEvent) => {
        const img = new Image();
        img.src = readerEvent.target?.result as string;
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
          
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(dataUrl);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async () => {
    if (!notes.trim() && !selectedPhoto) return;
    setIsSubmitting(true);
    setSubmitError(false);

    try {
      let photoDataUrl: string | null = null;
      if (selectedPhoto) {
        photoDataUrl = await compressImage(selectedPhoto);
      }

      const url = getBackendHttpUrl();
      await axios.post(`${url}/incidents`, {
        source: 'citizen',
        gps_coordinates: userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null,
        photo_url: photoDataUrl,
        notes: notes.trim() || 'Attached photo evidence',
        client_device_id: clientDeviceId,
      });

      setSubmitSuccess(true);
      setNotes('');
      handleRemovePhoto();
      setTimeout(() => setSubmitSuccess(false), 3500);
      fetchMyReports();
    } catch (e) {
      console.error('Failed to submit report', e);
      setSubmitError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addPresetTag = (tag: string) => {
    setNotes((prev) => (prev ? `${prev} • ${tag}` : tag));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Title */}
      <div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: '#ffffff' }}>
          {getTranslation(selectedLanguage, 'reportIncident')}
        </h1>
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>
          Submit real-time crowd hazards or photo evidence to control room
        </p>
      </div>

      {/* Success Notification */}
      {submitSuccess && (
        <div style={{
          padding: '12px 14px',
          background: 'rgba(16, 185, 129, 0.15)',
          color: '#34d399',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          borderRadius: '10px',
          fontWeight: 600,
          fontSize: '0.82rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle2 size={18} />
          <span>{getTranslation(selectedLanguage, 'reportSuccess')}</span>
        </div>
      )}

      {/* Error Notification */}
      {submitError && (
        <div style={{
          padding: '12px 14px',
          background: 'rgba(239, 68, 68, 0.15)',
          color: '#f87171',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          borderRadius: '10px',
          fontSize: '0.82rem',
          fontWeight: 600,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} />
            <span>{getTranslation(selectedLanguage, 'reportError')}</span>
          </div>
          <button 
            onClick={handleSubmit}
            className="btn-primary"
            style={{ padding: '6px 12px', fontSize: '0.75rem', alignSelf: 'flex-start' }}
          >
            {getTranslation(selectedLanguage, 'retry')}
          </button>
        </div>
      )}

      {/* Main Glass Form Card */}
      <div className="glass-card">
        <div className="glass-card-header" style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-accent-violet)' }}>
            <FileText size={16} />
            <span>NEW INCIDENT DISPATCH</span>
          </div>

          {userLocation && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', color: 'var(--color-accent-cyan)' }} className="font-mono">
              <MapPin size={11} />
              <span>{userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}</span>
            </div>
          )}
        </div>

        <div className="glass-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Quick Presets */}
          <div>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
              Quick Hazard Tags:
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {PRESET_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => addPresetTag(tag)}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-panel)',
                    color: '#e2e8f0',
                    borderRadius: '999px',
                    padding: '4px 10px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(139, 92, 246, 0.2)';
                    e.currentTarget.style.borderColor = 'rgba(192, 132, 252, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                    e.currentTarget.style.borderColor = 'var(--border-panel)';
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Description Textarea */}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={getTranslation(selectedLanguage, 'describeIncident')}
            rows={3}
            style={{
              width: '100%',
              backgroundColor: 'rgba(5, 8, 17, 0.65)',
              border: '1px solid var(--border-panel)',
              borderRadius: '10px',
              padding: '12px',
              color: '#ffffff',
              fontSize: '0.85rem',
              fontFamily: 'var(--font-sans)',
              resize: 'vertical',
              outline: 'none',
              transition: 'border-color 0.15s ease'
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-accent-purple)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-panel)')}
          />

          {/* Photo Dropzone & Preview */}
          {photoPreview ? (
            <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-panel)' }}>
              <img
                src={photoPreview}
                alt="Selected evidence"
                style={{ width: '100%', maxHeight: '180px', objectFit: 'cover', display: 'block' }}
              />
              <button
                type="button"
                onClick={handleRemovePhoto}
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  backgroundColor: 'rgba(0, 0, 0, 0.75)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: '#ffffff',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {/* Take Photo with Camera */}
              <label style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '14px 10px',
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                border: '1px dashed var(--border-panel)',
                borderRadius: '10px',
                cursor: 'pointer',
                color: 'var(--color-text-muted)',
                transition: 'all 0.15s ease',
                textAlign: 'center'
              }}>
                <Camera size={20} style={{ color: 'var(--color-accent-violet)' }} />
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#f1f5f9' }}>
                  {getTranslation(selectedLanguage, 'takePhoto')}
                </span>
                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)' }}>
                  Camera Capture
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoSelect}
                  style={{ display: 'none' }}
                />
              </label>

              {/* Upload from Gallery / Files */}
              <label style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '14px 10px',
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                border: '1px dashed var(--border-panel)',
                borderRadius: '10px',
                cursor: 'pointer',
                color: 'var(--color-text-muted)',
                transition: 'all 0.15s ease',
                textAlign: 'center'
              }}>
                <ImageIcon size={20} style={{ color: 'var(--color-accent-cyan)' }} />
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#f1f5f9' }}>
                  Choose from Gallery
                </span>
                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-dim)' }}>
                  Photos / Files
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || (!notes.trim() && !selectedPhoto)}
            className="btn-primary"
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '0.88rem',
              cursor: (!notes.trim() && !selectedPhoto) ? 'not-allowed' : 'pointer',
              opacity: (!notes.trim() && !selectedPhoto) ? 0.5 : 1
            }}
          >
            <Send size={16} />
            <span>{isSubmitting ? 'Transmitting to Control Room...' : getTranslation(selectedLanguage, 'submit')}</span>
          </button>
        </div>
      </div>

      {/* My Reports Feed */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={15} style={{ color: 'var(--color-accent-violet)' }} />
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {getTranslation(selectedLanguage, 'myReports')} ({myReports.length})
            </span>
          </div>
        </div>

        {isLoadingReports ? (
          <div style={{ color: 'var(--color-text-dim)', fontSize: '0.78rem', textAlign: 'center', padding: '16px' }}>
            Syncing reports...
          </div>
        ) : myReports.length === 0 ? (
          <div className="glass-card" style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: '0.78rem' }}>
            {getTranslation(selectedLanguage, 'noReportsYet')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {myReports.map((report: any) => (
              <div key={report.id} className="glass-card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--color-text-dim)' }}>
                      {new Date(report.submitted_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    {report.zone_id && (
                      <span className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--color-accent-cyan)', fontWeight: 700 }}>
                        [{report.zone_id}]
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      fontSize: '0.65rem',
                      padding: '2px 8px',
                      borderRadius: '99px',
                      background: report.ai_summary ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                      color: report.ai_summary ? '#34d399' : '#38bdf8',
                      border: `1px solid ${report.ai_summary ? 'rgba(16, 185, 129, 0.3)' : 'rgba(56, 189, 248, 0.3)'}`,
                      fontWeight: 700,
                      textTransform: 'uppercase'
                    }}>
                      {report.ai_summary ? 'Reviewed by AI' : 'Dispatched'}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleDeleteReport(report.id)}
                      disabled={deletingReportId === report.id}
                      title="Remove this report"
                      style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#f87171',
                        borderRadius: '6px',
                        padding: '3px 6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                <p style={{ margin: 0, fontSize: '0.8rem', color: '#f1f5f9', lineHeight: 1.4 }}>
                  {report.notes || 'Photo submission'}
                </p>

                {report.photo_url && (
                  <img
                    src={report.photo_url}
                    alt="Submitted evidence"
                    style={{
                      width: '100%',
                      maxHeight: '140px',
                      objectFit: 'cover',
                      borderRadius: '8px',
                      border: '1px solid var(--border-panel)'
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
