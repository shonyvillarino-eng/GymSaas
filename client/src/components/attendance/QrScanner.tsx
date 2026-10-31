import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { CameraOff, Loader2 } from 'lucide-react';

interface QrScannerProps {
  /** Called once per decoded frame that contains a code. The page decides throttling. */
  onDetect: (code: string) => void;
  /** While true the camera keeps running but detected codes are ignored. */
  paused?: boolean;
}

type ScannerStatus = 'starting' | 'ready' | 'error';

const ERROR_MESSAGES: Record<string, string> = {
  NotAllowedError: 'Camera permission was denied. Allow camera access in the browser, or register the entry manually.',
  PermissionDeniedError: 'Camera permission was denied. Allow camera access in the browser, or register the entry manually.',
  NotFoundError: 'No camera was found on this device. Use the manual check-in instead.',
  DevicesNotFoundError: 'No camera was found on this device. Use the manual check-in instead.',
  NotReadableError: 'The camera is already in use by another application. Close it and try again.',
  OverconstrainedError: 'No compatible camera is available on this device.',
  SecurityError: 'Camera access requires a secure (HTTPS or localhost) connection.',
};

/**
 * Camera preview + QR decoding.
 *
 * Decoding happens in the browser, but the scanned value is treated as opaque:
 * the server validates it, resolves the member of the authenticated gym and
 * applies the access policy — the code grants nothing by itself.
 */
export function QrScanner({ onDetect, paused = false }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onDetectRef = useRef(onDetect);
  const pausedRef = useRef(paused);
  const lastCodeRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });
  const [status, setStatus] = useState<ScannerStatus>('starting');
  const [message, setMessage] = useState('');

  onDetectRef.current = onDetect;
  pausedRef.current = paused;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    let settled = false;

    // Some browsers neither resolve nor reject getUserMedia when no camera is
    // available; without this the view would stay on "requesting permission".
    const timeout = setTimeout(() => {
      if (settled || cancelled) return;
      setStatus('error');
      setMessage('The camera did not respond. Check the device and the browser permissions, or use the manual check-in.');
    }, 10_000);

    const stop = () => {
      clearTimeout(timeout);
      if (timer) clearInterval(timer);
      timer = null;
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error');
        setMessage('This browser does not expose a camera API. Use the manual check-in instead.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        settled = true;
        clearTimeout(timeout);
        setStatus('ready');

        timer = setInterval(() => {
          const element = videoRef.current;
          const canvas = canvasRef.current;
          if (!element || !canvas || element.readyState < 2) return;
          if (pausedRef.current) return;

          const width = Math.min(element.videoWidth, 720);
          const height = element.videoHeight ? Math.round((element.videoHeight * width) / element.videoWidth) : 0;
          if (!width || !height) return;
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (!context) return;
          context.drawImage(element, 0, 0, width, height);
          const image = context.getImageData(0, 0, width, height);
          const decoded = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
          if (!decoded?.data) return;

          // Same code back-to-back within 3s is one physical scan, not two.
          const now = Date.now();
          if (lastCodeRef.current.value === decoded.data && now - lastCodeRef.current.at < 3000) return;
          lastCodeRef.current = { value: decoded.data, at: now };
          onDetectRef.current(decoded.data);
        }, 250);
      } catch (error) {
        settled = true;
        clearTimeout(timeout);
        const name = error instanceof Error ? error.name : '';
        setStatus('error');
        setMessage(ERROR_MESSAGES[name] ?? 'The camera could not be started. Use the manual check-in instead.');
      }
    };

    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border border-border bg-black/80">
        <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline autoPlay aria-label="QR scanner preview" />
        {status !== 'ready' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/90 px-6 text-center">
            {status === 'starting' ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Requesting camera permission…</p>
              </>
            ) : (
              <>
                <CameraOff className="h-8 w-8 text-destructive" />
                <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
              </>
            )}
          </div>
        )}
        {status === 'ready' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-48 w-48 rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
      <p className="text-xs text-muted-foreground">
        Point the camera at the member&apos;s credential. The code only identifies the member — the server validates it and
        applies the gym access rules.
      </p>
    </div>
  );
}
