'use client'

import { useState, useRef } from 'react'
import ReactCrop, {
  type Crop,
  type PixelCrop,
  centerCrop,
  makeAspectCrop,
} from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { Upload, Trash2, Loader2, ImageIcon, AlertCircle } from 'lucide-react'
import { Button } from './button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog'
import { useConfirm } from './confirm-dialog'

const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_SIZE_BYTES = 2 * 1024 * 1024 // 2 MB
const MAX_OUTPUT_SIZE = 1024 // square edge

interface ImageUploadCropProps {
  /** Current image URL (null if no image yet). */
  currentUrl: string | null
  /** Called with the cropped Blob + its mime type. Should upload to server. */
  onUpload: (blob: Blob, mime: string) => Promise<void>
  /** Called to remove the current image. */
  onRemove: () => Promise<void>
  /** Aspect ratio. Defaults to 1 (square). */
  aspect?: number
  /** Label rendered above the preview. */
  label?: string
  /** Help text below preview. */
  helpText?: string
  /** Disables all controls (e.g. non-admin viewer). */
  disabled?: boolean
}

/**
 * Generic image upload + client-side crop component.
 *
 * Preserves PNG/WebP alpha channels by using the source image's mime type
 * when encoding the cropped blob (JPEG is not alpha-capable and falls back
 * naturally to opaque output).
 */
export function ImageUploadCrop({
  currentUrl,
  onUpload,
  onRemove,
  aspect = 1,
  label = 'Imagem',
  helpText = 'PNG, JPEG ou WebP. Máximo 2MB. O recorte é feito antes do envio.',
  disabled = false,
}: ImageUploadCropProps) {
  const { confirm } = useConfirm()
  const inputRef = useRef<HTMLInputElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  const [srcDataUrl, setSrcDataUrl] = useState<string | null>(null)
  const [srcMime, setSrcMime] = useState<string | null>(null)
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [error, setError] = useState('')

  function pickFile() {
    if (disabled) return
    inputRef.current?.click()
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Allow re-selecting the same file later
    e.target.value = ''
    setError('')

    if (!ALLOWED_MIMES.includes(file.type)) {
      setError('Formato inválido. Envie PNG, JPEG ou WebP.')
      return
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError('Imagem muito grande (máx. 2MB).')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setSrcMime(file.type)
      setSrcDataUrl(reader.result as string)
      setCrop(undefined)
      setCompletedCrop(null)
      setDialogOpen(true)
    }
    reader.onerror = () => setError('Falha ao ler o arquivo.')
    reader.readAsDataURL(file)
  }

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget
    // Center a crop that covers ~90% of the shorter edge
    const initial = centerCrop(
      makeAspectCrop({ unit: '%', width: 90 }, aspect, w, h),
      w,
      h,
    )
    setCrop(initial)
  }

  async function handleConfirm() {
    if (!imgRef.current || !completedCrop || !srcMime) {
      setError('Ajuste o recorte antes de confirmar.')
      return
    }
    setError('')
    setIsUploading(true)
    try {
      const blob = await cropImageToBlob(imgRef.current, completedCrop, srcMime)
      await onUpload(blob, srcMime)
      closeDialog()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar imagem.')
    } finally {
      setIsUploading(false)
    }
  }

  async function handleRemove() {
    if (disabled || isRemoving) return
    const ok = await confirm({
      title: 'Remover a imagem atual?',
      description: 'A imagem será apagada permanentemente. Você pode enviar uma nova a qualquer momento.',
      variant: 'destructive',
      confirmLabel: 'Remover',
    })
    if (!ok) return
    setError('')
    setIsRemoving(true)
    try {
      await onRemove()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover.')
    } finally {
      setIsRemoving(false)
    }
  }

  function closeDialog() {
    setDialogOpen(false)
    setSrcDataUrl(null)
    setSrcMime(null)
    setCrop(undefined)
    setCompletedCrop(null)
  }

  return (
    <div className="space-y-3">
      {label && (
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </div>
      )}

      <div className="flex items-center gap-4">
        {/* Preview — checker pattern highlights transparent PNGs */}
        <div
          className="relative h-24 w-24 shrink-0 rounded-lg border border-border/60 overflow-hidden"
          style={{
            backgroundImage:
              'linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)',
            backgroundSize: '12px 12px',
            backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
            backgroundColor: '#f9fafb',
          }}
        >
          {currentUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentUrl}
              alt="Preview"
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
              <ImageIcon className="h-8 w-8" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={pickFile}
              disabled={disabled || isUploading || isRemoving}
              className="h-8 gap-1.5"
            >
              <Upload className="h-3.5 w-3.5" />
              {currentUrl ? 'Trocar' : 'Enviar'}
            </Button>
            {currentUrl && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRemove}
                disabled={disabled || isUploading || isRemoving}
                className="h-8 gap-1.5 text-destructive hover:bg-destructive/5 hover:text-destructive border-destructive/30"
              >
                {isRemoving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Remover
              </Button>
            )}
          </div>
          {helpText && (
            <p className="text-[11px] text-muted-foreground">{helpText}</p>
          )}
        </div>
      </div>

      {error && !dialogOpen && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/5 px-3 py-2 rounded-lg border border-destructive/15">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_MIMES.join(',')}
        onChange={onFileSelected}
        className="hidden"
      />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog()
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Outfit', sans-serif" }}>
              Ajustar recorte
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center justify-center bg-muted/30 rounded-lg py-4 min-h-[320px]">
            {srcDataUrl && (
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={aspect}
                keepSelection
                minWidth={40}
                minHeight={40}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  src={srcDataUrl}
                  alt="Para recorte"
                  onLoad={onImageLoad}
                  style={{ maxHeight: '60vh' }}
                />
              </ReactCrop>
            )}
          </div>

          <p className="text-xs text-muted-foreground px-1">
            Arraste as bordas para ajustar. A proporção é fixa em {aspect === 1 ? '1:1' : `${aspect}:1`}.
            Transparência (PNG) é preservada.
          </p>

          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/5 px-3 py-2 rounded-lg border border-destructive/15">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={closeDialog}
              disabled={isUploading}
              className="h-9"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={isUploading || !completedCrop}
              className="h-9 gap-1.5"
            >
              {isUploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isUploading ? 'Enviando…' : 'Confirmar e enviar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * Renders the selected crop onto a canvas and returns a Blob.
 *
 * - For `image/png` and `image/webp`, the canvas is not pre-filled, so the
 *   transparent background is preserved in the output.
 * - For `image/jpeg`, the canvas pixels are still transparent but JPEG will
 *   encode opaque (typically black) — the caller accepts this; if they want
 *   transparency they should upload PNG.
 */
async function cropImageToBlob(
  image: HTMLImageElement,
  crop: PixelCrop,
  mime: string,
): Promise<Blob> {
  const scaleX = image.naturalWidth / image.width
  const scaleY = image.naturalHeight / image.height

  const cropWidth = crop.width * scaleX
  const cropHeight = crop.height * scaleY

  // Clamp output to MAX_OUTPUT_SIZE on the longer edge to keep file size sane
  const ratio = Math.min(1, MAX_OUTPUT_SIZE / Math.max(cropWidth, cropHeight))
  const outW = Math.max(1, Math.round(cropWidth * ratio))
  const outH = Math.max(1, Math.round(cropHeight * ratio))

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas context indisponível.')

  // Fresh canvas is fully transparent — perfect for PNG/WebP alpha preservation.
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    cropWidth,
    cropHeight,
    0,
    0,
    outW,
    outH,
  )

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Falha ao codificar imagem.'))
      },
      mime,
      mime === 'image/jpeg' ? 0.92 : undefined,
    )
  })
}
