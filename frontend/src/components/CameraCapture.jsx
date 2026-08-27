import { useState, useRef, useEffect } from 'react'
import { Camera, X } from 'lucide-react'
import Button from './ui/Button'
import Spinner from './ui/Spinner'

/**
 * Live webcam capture for the face-verification baseline. Shared by the
 * onboarding wizard and the Profile page. Falls back to a message when the
 * browser blocks the camera — callers keep a file-picker route open too.
 */
export default function CameraCapture({ onCapture, onClose, busy }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 }, audio: false,
        })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setReady(true)
      } catch {
        if (!cancelled) setDenied(true)
      }
    })()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  const shoot = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (blob) onCapture(new File([blob], 'photo.jpg', { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.9)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-ink-900">Capture your photo</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-400 hover:bg-ink-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        {denied ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
            Camera access was blocked. Allow it in your browser, or upload an image file instead.
          </p>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl bg-ink-900">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} playsInline muted className="h-auto w-full" />
            </div>
            <p className="mt-2 text-xs text-ink-500">
              Face the camera in good lighting — this becomes your identity baseline.
            </p>
          </>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={shoot} disabled={!ready || busy}>
            {busy ? <><Spinner size={16} /> Uploading…</> : <><Camera className="h-4 w-4" /> Capture</>}
          </Button>
        </div>
      </div>
    </div>
  )
}
