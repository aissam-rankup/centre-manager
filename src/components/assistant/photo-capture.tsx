"use client";

import { Camera, LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { StudentAvatar } from "@/components/shared/student-avatar";
import { Button } from "@/components/ui/button";
import { LABELS } from "@/lib/constants/labels";
import { compressImage } from "@/lib/image/compress";
import { PHOTO_MAX_BYTES } from "@/lib/validation/assistant";

const L = LABELS.assistant.newStudent;

/** Photo compressée et son URL d'aperçu local (créée une seule fois). */
export type CapturedPhoto = { blob: Blob; previewUrl: string };

type PhotoCaptureProps = {
  name: string;
  value: CapturedPhoto | null;
  onChange: (photo: CapturedPhoto | null) => void;
};

/**
 * Capture directe avec l'appareil photo du téléphone (capture="environment"),
 * puis compression côté client (800 px, qualité 0,8) avant tout envoi.
 * Sur ordinateur, le même bouton ouvre le sélecteur de fichiers.
 */
export function PhotoCapture({ name, value, onChange }: PhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // L'URL d'aperçu précédente est libérée dès que la photo est remplacée ou retirée.
  const replace = (next: CapturedPhoto | null) => {
    if (value) URL.revokeObjectURL(value.previewUrl);
    onChange(next);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError(L.validation.photoInvalid);
      return;
    }
    setCompressing(true);
    try {
      const compressed = await compressImage(file, 800, 0.8);
      if (compressed.size > PHOTO_MAX_BYTES) {
        setError(L.validation.photoTooLarge);
        return;
      }
      replace({ blob: compressed, previewUrl: URL.createObjectURL(compressed) });
    } catch {
      setError(L.validation.photoInvalid);
    } finally {
      setCompressing(false);
      // Permet de reprendre la même photo.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <StudentAvatar name={name || "?"} photoUrl={value?.previewUrl ?? null} size="profile" />

      <div className="flex flex-col items-center gap-2 sm:items-start">
        <p className="font-medium">{L.fields.photo}</p>
        <p className="text-caption text-muted-foreground">{L.fields.photoHint}</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" variant="outline" disabled={compressing} onClick={() => inputRef.current?.click()}>
            {compressing ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : value ? (
              <RotateCcw aria-hidden />
            ) : (
              <Camera aria-hidden />
            )}
            {compressing ? L.fields.compressing : value ? L.fields.retakePhoto : L.fields.takePhoto}
          </Button>
          {value && !compressing ? (
            <Button type="button" variant="ghost" onClick={() => replace(null)}>
              <Trash2 aria-hidden />
              {L.fields.removePhoto}
            </Button>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-caption text-danger-ink">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
