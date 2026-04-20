'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Info } from 'lucide-react'
import { ImageUploadCrop } from '@/components/ui/image-upload-crop'
import { uploadOrgLogo, removeOrgLogo } from '@/app/actions/organization'

interface GeneralSectionProps {
  logoUrl: string | null
  /** Whether the current user can edit (only admin / super_admin). */
  canEdit: boolean
}

export function GeneralSection({ logoUrl, canEdit }: GeneralSectionProps) {
  const router = useRouter()
  const [currentLogo, setCurrentLogo] = useState<string | null>(logoUrl)

  async function handleUpload(blob: Blob, mime: string) {
    const fd = new FormData()
    fd.append('file', blob, `logo.${mime.split('/')[1]}`)
    const url = await uploadOrgLogo(fd)
    setCurrentLogo(url)
    router.refresh()
  }

  async function handleRemove() {
    await removeOrgLogo()
    setCurrentLogo(null)
    router.refresh()
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-card rounded-xl border border-border/50 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
        <div className="px-5 py-4 border-b border-border/40">
          <h3
            className="text-sm font-semibold"
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            Logo do time
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Aparece na barra lateral e em outras telas do sistema.
          </p>
        </div>

        <div className="px-5 py-5">
          <ImageUploadCrop
            currentUrl={currentLogo}
            onUpload={handleUpload}
            onRemove={handleRemove}
            disabled={!canEdit}
            label="Imagem do logo"
            helpText="PNG (ideal para fundo transparente), JPEG ou WebP. Máximo 2MB. Recorte 1:1 antes do envio."
          />

          {!canEdit && (
            <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 border border-border/40 rounded-lg px-3 py-2">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Apenas o administrador da organização pode alterar o logo. Se precisar ajustar,
                solicite ao responsável.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
