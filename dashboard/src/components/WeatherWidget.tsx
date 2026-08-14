import React from 'react';
import { useLiveDataStore } from '../store/liveDataStore';

const WeatherWidget: React.FC = () => {
  const weatherState = useLiveDataStore((state) => state.weatherState);

  if (!weatherState || !weatherState.details) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          backgroundColor: '#050811',
          padding: '0.4rem 0.8rem',
          borderRadius: '6px',
          border: '1px solid var(--border-panel)',
          color: 'var(--color-text-dim)',
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)',
          minWidth: '140px',
          justifyContent: 'center'
        }}
      >
        Weather Loading...
      </div>
    );
  }

  const { details, is_adverse_weather } = weatherState;
  
  // Format temperature
  const tempStr = (details && details.temp_c != null) ? `${Math.round(details.temp_c)}°C` : '--°C';
  const descStr = (details && details.description) ? details.description.charAt(0).toUpperCase() + details.description.slice(1) : 'Unknown';
  
  // Choose an icon based on weather main string
  let icon = '⛅';
  const mainLower = (details.main || '').toLowerCase();
  if (mainLower.includes('rain')) icon = '🌧️';
  else if (mainLower.includes('cloud')) icon = '☁️';
  else if (mainLower.includes('clear')) icon = '☀️';
  else if (mainLower.includes('thunderstorm')) icon = '⛈️';
  else if (mainLower.includes('snow')) icon = '❄️';
  else if (mainLower.includes('mist') || mainLower.includes('fog')) icon = '🌫️';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        backgroundColor: is_adverse_weather ? 'rgba(239, 68, 68, 0.1)' : '#050811',
        padding: '0.35rem 0.8rem',
        borderRadius: '6px',
        border: `1px solid ${is_adverse_weather ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-panel)'}`,
        transition: 'all 0.3s ease',
      }}
      title={`Wind: ${details.wind_speed} m/s | Humidity: ${details.humidity}%`}
    >
      <div style={{ fontSize: '1.2rem', lineHeight: 1 }}>{icon}</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ 
          color: is_adverse_weather ? '#fca5a5' : '#f8fafc', 
          fontWeight: 700, 
          fontSize: '0.8rem',
          fontFamily: 'var(--font-mono)' 
        }}>
          {tempStr}
        </span>
        <span style={{ 
          color: is_adverse_weather ? '#f87171' : 'var(--color-text-dim)', 
          fontSize: '0.65rem', 
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          {descStr}
        </span>
      </div>
      {is_adverse_weather && (
        <div style={{ 
          marginLeft: '0.5rem',
          padding: '0.15rem 0.4rem',
          backgroundColor: 'rgba(239, 68, 68, 0.2)',
          color: '#fef2f2',
          borderRadius: '4px',
          fontSize: '0.6rem',
          fontWeight: 800,
          letterSpacing: '0.05em'
        }}>
          ALERT
        </div>
      )}
    </div>
  );
};

export default WeatherWidget;
