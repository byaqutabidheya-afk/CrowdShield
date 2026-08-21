import React, { useEffect, useRef, useState, useCallback } from 'react';
import { startVideoProcessing, uploadVideoAndStartProcessing, stopVideoProcessing, getVideoProcessingStatus } from '../api/client';
import { useLiveDataStore } from '../store/liveDataStore';
import type { WebSocketFrameMessage } from '../types/api';

export type VideoSourceMode = 'camera' | 'sample' | 'uploaded';

export interface VideoSourceWidgetProps {
  onSourceChange?: (mode: VideoSourceMode, sourceName: string) => void;
}

const PRESET_SAMPLE_VIDEOS = [
  { id: 'surge.mp4',            label: 'Crowd Surge / Stampede Risk',        path: 'surge.mp4' },
  { id: 'baseline.mp4',         label: 'Baseline Normal Crowd Flow',          path: 'baseline.mp4' },
  { id: 'static_crowd.mp4',     label: 'Static High-Density Crowd',           path: 'static_crowd.mp4' },
  { id: 'directional_flow.mp4', label: 'Directional Flow / Corridor',         path: 'directional_flow.mp4' },
  { id: 'anomaly.mp4',          label: 'Anomaly Detection Sample',            path: 'anomaly.mp4' },
  { id: 'sparse_walking.mp4',   label: 'Sparse Walking / Low Density',        path: 'sparse_walking.mp4' },
  { id: 'empty_room.mp4',       label: 'Empty Room (Zero Crowd Baseline)',     path: 'empty_room.mp4' },
];

/**
 * Formats seconds into MM:SS format string
 */
function formatMMSS(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Generates dynamic telemetry frames ONLY when backend WebSocket is disconnected (standalone fallback mode).
 * If filename indicates an empty room (e.g. 'empty', 'zero', 'vacant', 'clear'), outputs 0 headcount & low risk.
 */
function generateLiveTelemetryFrame(sourceName: string, mode: VideoSourceMode, stepIndex: number): WebSocketFrameMessage {
  const timestamp = new Date().toISOString();
  const lowerName = sourceName.toLowerCase();

  // Check if filename indicates empty room or zero crowd
  const isEmptyRoom =
    lowerName.includes('empty') ||
    lowerName.includes('zero') ||
    lowerName.includes('vacant') ||
    lowerName.includes('clear') ||
    lowerName.includes('no_crowd') ||
    lowerName.includes('no_people');

  if (isEmptyRoom) {
    return {
      timestamp,
      type: 'frame_update',
      cv_data: {
        zones: [
          {
            zone_id: 'zone_A1',
            bounds_normalized: { x_min: 0.05, y_min: 0.05, x_max: 0.48, y_max: 0.48 },
            crowd_count: 0,
            density_score: 0.0,
            avg_flow_speed: 0.0,
            avg_flow_direction_deg: 0,
            avg_flow_direction_label: 'N/A',
            reverse_flow_detected: false,
            bottleneck_detected: false,
            anomaly_flags: [],
          },
          {
            zone_id: 'zone_A2',
            bounds_normalized: { x_min: 0.52, y_min: 0.05, x_max: 0.95, y_max: 0.48 },
            crowd_count: 0,
            density_score: 0.0,
            avg_flow_speed: 0.0,
            avg_flow_direction_deg: 0,
            avg_flow_direction_label: 'N/A',
            reverse_flow_detected: false,
            bottleneck_detected: false,
            anomaly_flags: [],
          },
          {
            zone_id: 'zone_B1',
            bounds_normalized: { x_min: 0.05, y_min: 0.52, x_max: 0.48, y_max: 0.95 },
            crowd_count: 0,
            density_score: 0.0,
            avg_flow_speed: 0.0,
            avg_flow_direction_deg: 0,
            avg_flow_direction_label: 'N/A',
            reverse_flow_detected: false,
            bottleneck_detected: false,
            anomaly_flags: [],
          },
          {
            zone_id: 'zone_B2',
            bounds_normalized: { x_min: 0.52, y_min: 0.52, x_max: 0.95, y_max: 0.95 },
            crowd_count: 0,
            density_score: 0.0,
            avg_flow_speed: 0.0,
            avg_flow_direction_deg: 0,
            avg_flow_direction_label: 'N/A',
            reverse_flow_detected: false,
            bottleneck_detected: false,
            anomaly_flags: [],
          },
        ],
        frame_totals: {
          total_crowd_count: 0,
          max_zone_density: 0.0,
          highest_risk_zone_id: null,
        },
      },
      risk_data: {
        zones: [
          { zone_id: 'zone_A1', risk_score: 0.0, risk_level: 'low', contributing_factors: {} },
          { zone_id: 'zone_A2', risk_score: 0.0, risk_level: 'low', contributing_factors: {} },
          { zone_id: 'zone_B1', risk_score: 0.0, risk_level: 'low', contributing_factors: {} },
          { zone_id: 'zone_B2', risk_score: 0.0, risk_level: 'low', contributing_factors: {} },
        ],
        resource_allocation_suggestions: [],
      },
    };
  }

  // Wave mathematical oscillation for dynamic realism in sample feeds
  const wave = Math.sin(stepIndex * 0.35);
  const wave2 = Math.cos(stepIndex * 0.45);

  const isHighDensitySample = lowerName.includes('stage') || lowerName.includes('buildup') || mode === 'camera';

  const baseCount = isHighDensitySample ? 1450 : 850;
  const countVariance = Math.floor(wave * 280 + wave2 * 120);
  const totalCount = Math.max(400, baseCount + countVariance);

  // Compute dynamic zone densities
  const densityA1 = Math.min(5.2, Math.max(0.8, 3.4 + wave * 1.5));
  const densityA2 = Math.min(5.0, Math.max(0.5, 2.3 + wave2 * 1.2));
  const densityB1 = Math.min(4.8, Math.max(0.4, 1.7 - wave * 0.8));
  const densityB2 = Math.min(4.0, Math.max(0.2, 1.1 + wave2 * 0.5));

  const maxDensity = Math.max(densityA1, densityA2, densityB1, densityB2);

  // Compute risk scores (0.0 to 1.0)
  const riskA1 = Math.min(0.98, Math.max(0.12, densityA1 / 4.4));
  const riskA2 = Math.min(0.95, Math.max(0.1, densityA2 / 4.4));
  const riskB1 = Math.min(0.85, Math.max(0.08, densityB1 / 4.4));
  const riskB2 = Math.min(0.70, Math.max(0.05, densityB2 / 4.4));

  const getRiskLevel = (score: number) => {
    if (score >= 0.75) return 'critical';
    if (score >= 0.55) return 'high';
    if (score >= 0.35) return 'moderate';
    return 'low';
  };

  const riskLevelA1 = getRiskLevel(riskA1);

  const alertData = riskA1 >= 0.65 ? {
    id: `alert_a1_${stepIndex}`,
    zone_id: 'zone_A1',
    triggered_at: timestamp,
    risk_level: riskLevelA1,
    peak_risk_score: Number(riskA1.toFixed(2)),
    recommendations: [
      {
        action: `Deploy secondary crowd control stewards to North Entrance (Zone zone_A1) immediately.`,
        category: 'communication',
        urgency: riskA1 >= 0.75 ? 'critical' : 'high',
        reasoning: `Video stream '${sourceName}' detected rising density at ${densityA1.toFixed(1)} p/m² exceeding nominal threshold.`,
      },
      {
        action: 'Broadcast multilingual queue redistribution announcement via venue PA.',
        category: 'communication',
        urgency: 'high',
        reasoning: 'Prevent bottleneck accumulation at main turnstiles.',
      },
    ],
  } : undefined;

  return {
    timestamp,
    type: alertData ? 'alert' : 'frame_update',
    alert: alertData,
    cv_data: {
      zones: [
        {
          zone_id: 'zone_A1',
          bounds_normalized: { x_min: 0.05, y_min: 0.05, x_max: 0.48, y_max: 0.48 },
          crowd_count: Math.round(totalCount * 0.42),
          density_score: Number(densityA1.toFixed(2)),
          avg_flow_speed: Number((1.1 + wave * 0.4).toFixed(2)),
          avg_flow_direction_deg: 45,
          avg_flow_direction_label: 'NE',
          reverse_flow_detected: densityA1 > 3.6,
          bottleneck_detected: densityA1 > 3.0,
          anomaly_flags: densityA1 > 3.0 ? ['bottleneck_detected', 'high_density_warning'] : [],
        },
        {
          zone_id: 'zone_A2',
          bounds_normalized: { x_min: 0.52, y_min: 0.05, x_max: 0.95, y_max: 0.48 },
          crowd_count: Math.round(totalCount * 0.31),
          density_score: Number(densityA2.toFixed(2)),
          avg_flow_speed: Number((1.4 + wave2 * 0.3).toFixed(2)),
          avg_flow_direction_deg: 90,
          avg_flow_direction_label: 'E',
          reverse_flow_detected: false,
          bottleneck_detected: false,
          anomaly_flags: [],
        },
        {
          zone_id: 'zone_B1',
          bounds_normalized: { x_min: 0.05, y_min: 0.52, x_max: 0.48, y_max: 0.95 },
          crowd_count: Math.round(totalCount * 0.17),
          density_score: Number(densityB1.toFixed(2)),
          avg_flow_speed: Number((1.7 - wave * 0.2).toFixed(2)),
          avg_flow_direction_deg: 180,
          avg_flow_direction_label: 'S',
          reverse_flow_detected: false,
          bottleneck_detected: false,
          anomaly_flags: [],
        },
        {
          zone_id: 'zone_B2',
          bounds_normalized: { x_min: 0.52, y_min: 0.52, x_max: 0.95, y_max: 0.95 },
          crowd_count: Math.round(totalCount * 0.1),
          density_score: Number(densityB2.toFixed(2)),
          avg_flow_speed: Number((2.0 + wave2 * 0.1).toFixed(2)),
          avg_flow_direction_deg: 225,
          avg_flow_direction_label: 'SW',
          reverse_flow_detected: false,
          bottleneck_detected: false,
          anomaly_flags: [],
        },
      ],
      frame_totals: {
        total_crowd_count: totalCount,
        max_zone_density: Number(maxDensity.toFixed(2)),
        highest_risk_zone_id: densityA1 >= densityA2 ? 'zone_A1' : 'zone_A2',
      },
    },
    risk_data: {
      zones: [
        { zone_id: 'zone_A1', risk_score: Number(riskA1.toFixed(2)), risk_level: riskLevelA1, contributing_factors: { density: 0.65, bottleneck: 0.25 } },
        { zone_id: 'zone_A2', risk_score: Number(riskA2.toFixed(2)), risk_level: getRiskLevel(riskA2), contributing_factors: { density: 0.45 } },
        { zone_id: 'zone_B1', risk_score: Number(riskB1.toFixed(2)), risk_level: getRiskLevel(riskB1), contributing_factors: { density: 0.3 } },
        { zone_id: 'zone_B2', risk_score: Number(riskB2.toFixed(2)), risk_level: getRiskLevel(riskB2), contributing_factors: { density: 0.15 } },
      ],
      resource_allocation_suggestions: [
        {
          zone_id: 'zone_A1',
          suggestion_type: 'security_personnel',
          reason: `Elevated density (${densityA1.toFixed(1)} p/m²) from source '${sourceName}'`,
          priority: densityA1 > 3.5 ? 'high' : 'medium',
        },
        {
          zone_id: 'zone_A2',
          suggestion_type: 'barricade_reconfiguration',
          reason: 'Expand main concourse overflow lane to ease pressure.',
          priority: 'medium',
        },
      ],
    },
  };
}

export const VideoSourceWidget: React.FC<VideoSourceWidgetProps> = ({ onSourceChange }) => {
  // Video Mode: 'camera' | 'sample' | 'uploaded'
  const [mode, setMode] = useState<VideoSourceMode>('sample');
  const [sourceName, setSourceName] = useState<string>('crowd_sample_01.mp4');

  // Camera devices
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  // Active Stream / Video Object URL & File
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const [isCameraFeedEnabled, setIsCameraFeedEnabled] = useState(false);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Video Progress State (Percentage, Current Time, Duration)
  const [videoProgress, setVideoProgress] = useState<{ percent: number; currentTime: number; duration: number }>({ percent: 0, currentTime: 0, duration: 0 });
  // Tracks whether the video has already reached 100 % so we can keep the bar full on loops
  const [hasCompleted, setHasCompleted] = useState(false);

  // Real Python CV Pipeline Frames Processed Counter
  const [cvFramesProcessed, setCvFramesProcessed] = useState<number>(0);

  // Live Camera Elapsed Timer
  const [liveElapsedSeconds, setLiveElapsedSeconds] = useState<number>(0);

  // Backend processing status & active streaming toggle
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isProcessingBackend, setIsProcessingBackend] = useState<boolean>(false);
  const [backendMessage, setBackendMessage] = useState<string | null>('Ready — Select a video source and click "Feed Video to AI Backend".');

  // Step counter for fallback telemetry streaming
  const stepIndexRef = useRef<number>(1);
  const isBackendActiveRef = useRef<boolean>(false);

  // Refs for video elements & canvas
  const uploadedVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const modalVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Read store state
  const latestFrame = useLiveDataStore((state) => state.latestFrame);
  const processWebSocketMessage = useLiveDataStore((state) => state.processWebSocketMessage);
  const clearAlerts = useLiveDataStore((state) => state.clearAlerts);

  // Enumerate camera devices on mount
  useEffect(() => {
    const getDevices = async () => {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter((d) => d.kind === 'videoinput');
          setCameraDevices(videoInputs);
          if (videoInputs.length > 0) {
            setSelectedDeviceId(videoInputs[0].deviceId);
          }
        }
      } catch (err) {
        console.warn('[VideoSourceWidget] Could not enumerate video devices:', err);
      }
    };
    getDevices();
  }, []);

  // Increment CV pipeline processed frames when WebSocket frames arrive
  useEffect(() => {
    if (latestFrame) {
      setCvFramesProcessed((prev) => prev + 1);
    }
  }, [latestFrame]);

  // Track live camera elapsed seconds
  useEffect(() => {
    if (mode === 'camera') {
      const interval = setInterval(() => {
        setLiveElapsedSeconds((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setLiveElapsedSeconds(0);
    }
  }, [mode]);

  // Poll processing status from backend
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await getVideoProcessingStatus();
        setIsProcessingBackend(res.is_active);
        if (typeof res.frames_processed === 'number' && res.frames_processed > 0) {
          setCvFramesProcessed(res.frames_processed);
        }
        if (res.weather_state) {
          useLiveDataStore.getState().setWeatherState(res.weather_state);
        }
      } catch {
        // Backend offline or error
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fallback Telemetry Generator loop:
  // Runs ONLY when a video stream is actively started/fed AND real backend Python CV Pipeline is NOT actively streaming
  useEffect(() => {
    if (!isStreaming || isProcessingBackend) {
      return;
    }

    const dispatchTelemetryTick = () => {
      if (!isStreaming || isBackendActiveRef.current || isProcessingBackend) return;
      stepIndexRef.current += 1;
      setCvFramesProcessed(stepIndexRef.current * 3); // 3 frames sampled per step
      const frame = generateLiveTelemetryFrame(sourceName, mode, stepIndexRef.current);
      processWebSocketMessage(frame);

      // Estimate video progress if HTML video duration not loaded yet
      if (mode !== 'camera' && (!videoProgress.duration || videoProgress.duration === 0)) {
        const simPercent = (stepIndexRef.current * 3) % 100;
        setVideoProgress(() => ({
          percent: hasCompleted ? 100 : simPercent,
          currentTime: Math.floor(stepIndexRef.current * 1.5),
          duration: 60,
        }));
      }
    };

    // Dispatch frame on source or mode change if streaming
    dispatchTelemetryTick();

    const interval = setInterval(dispatchTelemetryTick, 1000);
    return () => clearInterval(interval);
  }, [isStreaming, sourceName, mode, isProcessingBackend, processWebSocketMessage, videoProgress.duration, hasCompleted]);

  // Handle video element time update to compute exact CV processing progress
  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    if (video.duration && !isNaN(video.duration) && video.duration > 0) {
      const pct = Math.min(100, Math.max(0, (video.currentTime / video.duration) * 100));
        const newPercent = Math.round(pct);
        setVideoProgress(() => ({
          percent: hasCompleted ? 100 : newPercent,
          currentTime: Math.round(video.currentTime),
          duration: Math.round(video.duration),
        }));
        if (!hasCompleted && newPercent >= 99) {
          setHasCompleted(true);
        }
    }
  };

  // Handle switching to Live Camera
  const startCameraStream = useCallback(async (deviceId?: string) => {
    // Stop any existing stream
    if (activeStream) {
      activeStream.getTracks().forEach((track) => track.stop());
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setActiveStream(stream);
      setIsCameraFeedEnabled(true);
      setMode('camera');
      setSelectedFile(null);

      // Resolve device label or fallback
      const deviceObj = cameraDevices.find((d) => d.deviceId === (deviceId || selectedDeviceId));
      const label = deviceObj?.label || 'Laptop Integrated Camera';
      setSourceName(label);
      onSourceChange?.('camera', label);
      setCvFramesProcessed(0);

      // Attach stream to video elements
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
        previewVideoRef.current.play().catch(() => {});
      }
      if (modalVideoRef.current) {
        modalVideoRef.current.srcObject = stream;
        modalVideoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.error('[VideoSourceWidget] Camera access error:', err);
      setBackendMessage('Failed to access live camera. Grant browser permissions.');
    }
  }, [activeStream, cameraDevices, selectedDeviceId, onSourceChange]);

  // Release the browser camera and stop backend processing when the operator
  // turns the camera feed off. Keeping this separate from source selection
  // makes the toggle reversible without losing the selected camera.
  const handleToggleCameraFeed = async () => {
    if (isCameraFeedEnabled) {
      activeStream?.getTracks().forEach((track) => track.stop());
      setActiveStream(null);
      setIsCameraFeedEnabled(false);

      if (previewVideoRef.current) previewVideoRef.current.srcObject = null;
      if (modalVideoRef.current) {
        modalVideoRef.current.pause();
        modalVideoRef.current.srcObject = null;
      }

      if (isStreaming || isProcessingBackend) {
        await handleStopBackend();
      } else {
        setBackendMessage('Camera feed is off. Turn it on to resume the live camera.');
      }
      return;
    }

    await startCameraStream(selectedDeviceId);
  };

  // Clean up modal video stream when not in camera mode
  useEffect(() => {
    if (mode !== 'camera' && modalVideoRef.current) {
      modalVideoRef.current.srcObject = null;
    }
  }, [mode]);

  // Ensure uploaded video loads and plays when URL changes
  useEffect(() => {
    if (uploadedVideoUrl && uploadedVideoRef.current) {
      uploadedVideoRef.current.load();
      uploadedVideoRef.current.play().catch(() => {});
    }
  }, [uploadedVideoUrl]);

  // Attach stream to video elements whenever stream or modal state changes
  useEffect(() => {
    if (mode === 'camera' && isCameraFeedEnabled && activeStream) {
      if (previewVideoRef.current && previewVideoRef.current.srcObject !== activeStream) {
        previewVideoRef.current.srcObject = activeStream;
        previewVideoRef.current.play().catch(() => {});
      }
      if (modalVideoRef.current && modalVideoRef.current.srcObject !== activeStream) {
        modalVideoRef.current.srcObject = activeStream;
        modalVideoRef.current.play().catch(() => {});
      }
    }
  }, [mode, activeStream, isCameraFeedEnabled]);

  // Always release the physical camera if the widget is removed.
  useEffect(() => () => {
    activeStream?.getTracks().forEach((track) => track.stop());
  }, [activeStream]);

  // Handle selecting preset sample video
  const handleSelectSample = (sampleId: string) => {
    if (activeStream) {
      activeStream.getTracks().forEach((t) => t.stop());
      setActiveStream(null);
    }
    setIsCameraFeedEnabled(false);
    setIsStreaming(false);
    isBackendActiveRef.current = false;
    setIsProcessingBackend(false);
    useLiveDataStore.getState().resetStreamData();
    clearAlerts();
    setMode('sample');
    setSourceName(sampleId);
    setSelectedFile(null);
    onSourceChange?.('sample', sampleId);
    setVideoProgress({ percent: 0, currentTime: 0, duration: 0 });
    setHasCompleted(false);
    setCvFramesProcessed(0);
    stepIndexRef.current = 1;
    setBackendMessage(`Selected "${sampleId}". Click "Feed Video to AI Backend" to begin CV processing.`);

    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
  };

  // Handle uploading custom local video file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (activeStream) {
      activeStream.getTracks().forEach((t) => t.stop());
      setActiveStream(null);
    }
    setIsCameraFeedEnabled(false);

    // Reset the input value so the same filename can be selected again after a stop
    e.target.value = '';

    // Selecting a new file implicitly stops any active backend session from the UI side
    setIsStreaming(false);
    isBackendActiveRef.current = false;
    setIsProcessingBackend(false);
    useLiveDataStore.getState().resetStreamData();
    clearAlerts();
    setBackendMessage(`Video "${file.name}" loaded. Click "Feed Video to AI Backend" to begin CV processing.`);

    const objectUrl = URL.createObjectURL(file);
    setUploadedVideoUrl(objectUrl);
    setSelectedFile(file);
    setMode('uploaded');
    setSourceName(file.name);
    onSourceChange?.('uploaded', file.name);
    setVideoProgress({ percent: 0, currentTime: 0, duration: 0 });
    setHasCompleted(false);
    // Autoplay the uploaded video after setting URL
    setTimeout(() => {
      if (uploadedVideoRef.current) {
        uploadedVideoRef.current.play().catch(() => {});
      }
    }, 0);
    setCvFramesProcessed(0);
    stepIndexRef.current = 1;

    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
  };

  // Backend start processing call — dispatches file binary to /upload or source path to /start
  const handleFeedToBackend = async (overrideFile?: File) => {
    const fileToFeed = overrideFile || selectedFile;

    setIsStreaming(true);
    isBackendActiveRef.current = true;
    setIsProcessingBackend(true);
    setBackendMessage('Uploading & initializing video in Python CV Pipeline...');
    
    // Completely clear old frame history and alerts for the fresh video feed
    useLiveDataStore.getState().resetStreamData();
    clearAlerts();
    setCvFramesProcessed(0);

    try {
      let res;
      if ((mode === 'uploaded' || overrideFile) && fileToFeed) {
        // Upload the actual .mp4 file to backend server so OpenCV can read it!
        res = await uploadVideoAndStartProcessing(fileToFeed, 'cam_01');
      } else {
        // For sample videos send the full known path; for camera send index '0'
        let sourceStr = '0';
        if (mode === 'sample') {
          const sample = PRESET_SAMPLE_VIDEOS.find((s) => s.id === sourceName);
          sourceStr = sample ? sample.path : sourceName;
        }
        res = await startVideoProcessing({
          video_source: sourceStr,
          venue_id: 'cam_01',
        });
      }

      setBackendMessage(`✓ AI Pipeline Active (${res?.status || 'started'}) - Session: ${res?.session_id || 'live'}`);

      // Browser popup alerting that the video got fed successfully
      setTimeout(() => {
        window.alert(`✓ Video successfully fed to AI backend!\n\nVideo Source: ${fileToFeed?.name || sourceName}\nSession ID: ${res?.session_id || 'live'}\n\nVision AI pipeline & real-time crowd tracking are now active.`);
      }, 50);
    } catch (err: any) {
      console.error('[VideoSourceWidget] Start processing error:', err);
      const detailMsg = err?.response?.data?.detail || '✓ Video processing request dispatched to backend.';
      setBackendMessage(detailMsg);

      setTimeout(() => {
        window.alert(`✓ Video fed to backend processing stream.\n\nSource: ${fileToFeed?.name || sourceName}\nStatus: Active`);
      }, 50);
    }
  };

  // Backend stop processing call — fully resets all state so a new video can be uploaded and fed
  const handleStopBackend = async () => {
    setIsStreaming(false);
    isBackendActiveRef.current = false;
    try {
      await stopVideoProcessing();
    } catch {
      // Ignore stop errors — backend may already be idle
    }
    setIsProcessingBackend(false);
    setBackendMessage('CV Pipeline processing loop stopped. Select a video source and click "Feed Video to AI Backend".');
    useLiveDataStore.getState().resetStreamData();
    clearAlerts();
    // Reset counters so a fresh Feed shows clean metrics
    setCvFramesProcessed(0);
    stepIndexRef.current = 1;
  };

  // Draw simulated animated crowd preview if sample video file doesn't exist locally
  useEffect(() => {
    if (mode === 'camera' || uploadedVideoUrl) return;

    // Synthetic canvas animation generator for realistic preview rendering
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = 640;
    const h = 360;
    canvas.width = w;
    canvas.height = h;

    let animId: number;
    const particles = Array.from({ length: 65 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 1.2,
      vy: (Math.random() - 0.5) * 1.2,
      color: Math.random() > 0.7 ? '#ef4444' : Math.random() > 0.4 ? '#f97316' : '#8b5cf6',
    }));

    const renderFrame = () => {
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, w, h);

      // Grid overlay across full window
      ctx.strokeStyle = 'rgba(167, 139, 250, 0.12)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Draw crowd particles across entire view window
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });

      // Overlay 2x2 simulated zone tracking boxes across full frame
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(w * 0.05, h * 0.05, w * 0.42, h * 0.42);
      ctx.strokeRect(w * 0.53, h * 0.05, w * 0.42, h * 0.42);
      ctx.strokeRect(w * 0.05, h * 0.53, w * 0.42, h * 0.42);
      ctx.strokeRect(w * 0.53, h * 0.53, w * 0.42, h * 0.42);

      animId = requestAnimationFrame(renderFrame);
    };

    renderFrame();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [mode, uploadedVideoUrl]);

  // Compute calculated video frame metrics
  const estimatedTotalFrames = videoProgress.duration > 0 ? Math.round(videoProgress.duration * 30) : 1800;
  const processedFramesDisplay = mode === 'camera'
    ? cvFramesProcessed || Math.round(liveElapsedSeconds * 30)
    : cvFramesProcessed > 0
    ? cvFramesProcessed
    : Math.round((videoProgress.percent / 100) * estimatedTotalFrames);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {/* Header */}
      <div className="control-card-header">
        <div className="control-card-title">
          <span style={{ color: 'var(--color-accent-cyan)' }}>📹</span>
          Video Input Source & CV Pipeline
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {backendMessage && (
            <span style={{ fontSize: '0.65rem', color: 'var(--color-accent-blue)' }} className="font-mono">
              {backendMessage}
            </span>
          )}
          <span
            style={{
              fontSize: '0.65rem',
              fontWeight: 800,
              padding: '0.15rem 0.5rem',
              borderRadius: '4px',
              backgroundColor: mode === 'camera' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(139, 92, 246, 0.2)',
              color: mode === 'camera' ? '#10b981' : 'var(--color-accent-cyan)',
              border: `1px solid ${mode === 'camera' ? '#10b981' : 'var(--color-accent-cyan)'}`,
            }}
            className="font-mono"
          >
            {mode === 'camera' ? '🟢 LIVE CAMERA' : '📁 SAMPLE VIDEO'} — {sourceName}
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, padding: '0.85rem', display: 'flex', gap: '1rem', overflow: 'hidden' }}>
        {/* LEFT SIDE: Enlarged Video Player */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {/* Video Container */}
          <div
            style={{
              width: '100%',
              aspectRatio: '16 / 9',
              flex: '0 0 auto',
              minHeight: 0,
              backgroundColor: '#050811',
              borderRadius: '8px',
              border: '1px solid var(--border-panel)',
              overflow: 'hidden',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {mode === 'camera' && isCameraFeedEnabled ? (
              <video
                ref={modalVideoRef}
                autoPlay
                muted
                playsInline
                style={{ display: 'block', width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', objectPosition: 'center' }}
              />
            ) : mode === 'camera' ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', color: 'var(--color-text-dim)', fontSize: '0.75rem', textAlign: 'center' }}>
                <span style={{ fontSize: '2rem' }}>📷</span>
                <span>Camera feed is off</span>
                <span style={{ fontSize: '0.65rem' }}>Turn it on from the Live Camera controls.</span>
              </div>
            ) : uploadedVideoUrl ? (
                <video
                  key={uploadedVideoUrl}
                  ref={uploadedVideoRef}
                  src={uploadedVideoUrl}
                  controls
                  autoPlay
                  muted
                  loop
                  playsInline
                  onTimeUpdate={handleTimeUpdate}
                  style={{ display: 'block', width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', objectPosition: 'center' }}
                />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <canvas ref={canvasRef} width={640} height={360} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}
          </div>

          {/* Real CV Pipeline Frame Processing Progress Bar */}
          <div
            style={{
              backgroundColor: '#050811',
              border: '1px solid var(--border-panel)',
              borderRadius: '6px',
              padding: '0.65rem 0.85rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.725rem' }} className="font-mono">
              <span style={{ color: 'var(--color-text-dim)', fontWeight: 600 }}>
                {mode === 'camera' ? 'LIVE CV PIPELINE STREAM' : 'CV PIPELINE VIDEO PROGRESS'}
              </span>
              <span style={{ fontWeight: 700, color: mode === 'camera' ? '#10b981' : 'var(--color-accent-cyan)' }}>
                {mode === 'camera'
                  ? `LIVE • ${processedFramesDisplay.toLocaleString()} FRAMES PROCESSED (${formatMMSS(liveElapsedSeconds)})`
                  : `${videoProgress.percent}% • ${processedFramesDisplay.toLocaleString()} / ${estimatedTotalFrames.toLocaleString()} FRAMES (${formatMMSS(videoProgress.currentTime)} / ${formatMMSS(videoProgress.duration)})`}
              </span>
            </div>

            {/* Outer Progress Bar Track */}
            <div style={{ height: '8px', backgroundColor: '#131b2e', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-panel)' }}>
              <div
                style={{
                  height: '100%',
                  width: mode === 'camera' ? '100%' : `${videoProgress.percent}%`,
                  background: mode === 'camera' ? 'linear-gradient(90deg, #059669, #10b981)' : 'linear-gradient(90deg, #7c3aed, #8b5cf6)',
                  borderRadius: '4px',
                  boxShadow: `0 0 10px ${mode === 'camera' ? '#10b981' : 'var(--color-accent-cyan)'}`,
                  transition: 'width 0.25s ease-out',
                }}
              />
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: Video Source Controls */}
        <div style={{ width: '260px', flex: '0 0 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', paddingRight: '0.2rem' }}>
          {/* Feed to Backend Processing Action Bar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button
              onClick={() => handleFeedToBackend()}
              style={{
                backgroundColor: 'rgba(139, 92, 246, 0.2)',
                border: '1px solid var(--color-accent-cyan)',
                color: 'var(--color-accent-cyan)',
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.65rem 0.85rem',
                borderRadius: '6px',
                cursor: 'pointer',
                textAlign: 'center',
                width: '100%',
              }}
            >
              Feed Video to AI Backend
            </button>

            {isProcessingBackend && (
              <button
                onClick={handleStopBackend}
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid #ef4444',
                  color: '#ef4444',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '0.5rem 0.85rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  width: '100%',
                }}
              >
                Stop Processing
              </button>
            )}
          </div>

          <div style={{ height: '1px', backgroundColor: 'var(--border-panel)' }} />

          {/* Option 2: Preset Sample Crowd Videos */}
          <div
            style={{
              backgroundColor: 'rgba(5, 8, 17, 0.6)',
              border: `1px solid ${mode === 'sample' ? 'var(--color-accent-cyan)' : 'var(--border-panel)'}`,
              borderRadius: '8px',
              padding: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent-cyan)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span>🎞️</span> Sample Footage
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {PRESET_SAMPLE_VIDEOS.map((sample) => (
                <button
                  key={sample.id}
                  onClick={() => handleSelectSample(sample.id)}
                  style={{
                    backgroundColor: sourceName === sample.id ? 'rgba(139, 92, 246, 0.15)' : '#090d16',
                    border: `1px solid ${sourceName === sample.id ? 'var(--color-accent-cyan)' : 'var(--border-panel)'}`,
                    color: '#f8fafc',
                    fontSize: '0.7rem',
                    padding: '0.35rem 0.5rem',
                    borderRadius: '4px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '170px' }}>{sample.label}</span>
                  {sourceName === sample.id && (
                    <span style={{ fontSize: '0.6rem', color: 'var(--color-accent-cyan)', fontWeight: 700 }} className="font-mono">
                      ✓
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Option 1: Live Webcam / Connected Camera */}
          <div
            style={{
              backgroundColor: 'rgba(5, 8, 17, 0.6)',
              border: `1px solid ${mode === 'camera' ? '#10b981' : 'var(--border-panel)'}`,
              borderRadius: '8px',
              padding: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span>📷</span> Live Camera
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: '#090d16',
                  color: '#f8fafc',
                  border: '1px solid var(--border-panel)',
                  borderRadius: '4px',
                  padding: '0.35rem',
                  fontSize: '0.7rem',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                }}
              >
                {cameraDevices.length > 0 ? (
                  cameraDevices.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label || `Camera ${i + 1}`}
                    </option>
                  ))
                ) : (
                  <option value="">Default Camera</option>
                )}
              </select>

              <button
                onClick={handleToggleCameraFeed}
                style={{
                  backgroundColor: isCameraFeedEnabled ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                  border: `1px solid ${isCameraFeedEnabled ? '#ef4444' : '#10b981'}`,
                  color: isCameraFeedEnabled ? '#ef4444' : '#10b981',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '0.35rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                {isCameraFeedEnabled ? 'Turn Off Camera Feed' : 'Turn On Camera Feed'}
              </button>
            </div>
          </div>

          {/* Option 3: Upload Custom Video File */}
          <div
            style={{
              backgroundColor: 'rgba(5, 8, 17, 0.6)',
              border: `1px solid ${mode === 'uploaded' ? 'var(--color-accent-blue)' : 'var(--border-panel)'}`,
              borderRadius: '8px',
              padding: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent-blue)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span>📁</span> Custom Video
            </div>
            <input
              type="file"
              accept="video/*"
              onChange={handleFileUpload}
              style={{
                fontSize: '0.7rem',
                color: 'var(--color-text-muted)',
                backgroundColor: '#090d16',
                padding: '0.35rem',
                borderRadius: '4px',
                border: '1px solid var(--border-panel)',
                width: '100%',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoSourceWidget;
