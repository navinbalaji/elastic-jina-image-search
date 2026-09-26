'use client';

import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiLoadingSpinner,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
} from '@elastic/eui';
import { useEffect, useRef, useState, type SVGProps } from 'react';

type Facing = 'user' | 'environment';

// EUI has no camera glyph, so this one follows its 16px outline style
export function CameraIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" stroke="currentColor" {...props}>
      {/* EUI fills icons with the text color, so the outline sets its own fill */}
      <g style={{ fill: 'none' }}>
        <path d="M1.5 5A1.5 1.5 0 0 1 3 3.5h2l1-1.5h4l1 1.5h2A1.5 1.5 0 0 1 14.5 5v7a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 12z" />
        <circle cx={8} cy={8.5} r={2.75} />
      </g>
    </svg>
  );
}

function cameraError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError') return 'Camera access was blocked. Allow it in your browser settings and try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device.';
  if (name === 'NotReadableError') return 'The camera is in use by another app.';
  return 'Could not start the camera.';
}

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const video = useRef<HTMLVideoElement>(null);
  // Front camera first, for selfies
  const [facing, setFacing] = useState<Facing>('user');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Camera needs HTTPS or localhost
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser can only use the camera on a secure (HTTPS) page.');
      return;
    }
    let stream: MediaStream | null = null;
    let cancelled = false;
    setReady(false);
    setError(null);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch((err) => !cancelled && setError(cameraError(err)));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  function capture() {
    const v = video.current;
    if (!v?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Save selfies mirrored, the way they look in the preview
    if (facing === 'user') ctx.setTransform(-1, 0, 0, 1, canvas.width, 0);
    ctx.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => blob && onCapture(new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' })),
      'image/jpeg',
      0.92,
    );
  }

  return (
    <EuiModal onClose={onClose} style={{ width: 560, maxWidth: '100%' }}>
      <EuiModalHeader>
        <EuiModalHeaderTitle>Take a photo</EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        {error ? (
          <EuiCallOut title={error} color="danger" iconType="error" size="s" />
        ) : (
          <div style={{ position: 'relative', background: '#000', borderRadius: 6, overflow: 'hidden' }}>
            {!ready && (
              <EuiFlexGroup justifyContent="center" alignItems="center" style={{ position: 'absolute', inset: 0 }}>
                <EuiLoadingSpinner size="xl" />
              </EuiFlexGroup>
            )}
            <video
              ref={video}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={() => setReady(true)}
              aria-label="Camera preview"
              style={{
                display: 'block',
                width: '100%',
                aspectRatio: ready ? undefined : '4 / 3',
                maxHeight: '60vh',
                objectFit: 'contain',
                transform: facing === 'user' ? 'scaleX(-1)' : undefined,
              }}
            />
          </div>
        )}
      </EuiModalBody>
      <EuiModalFooter>
        <EuiButtonEmpty iconType="refresh" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}>
          {facing === 'user' ? 'Back camera' : 'Front camera'}
        </EuiButtonEmpty>
        <EuiButton fill iconType={CameraIcon} onClick={capture} isDisabled={!ready || Boolean(error)}>
          Capture and search
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  );
}
