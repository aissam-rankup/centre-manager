"use client";

import { ChoiceItem } from "@/components/shared/choice-item";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { CenterTypeOption } from "@/lib/data/platform";
import { useLabels, useMessage } from "@/lib/i18n/client";
import { type CustomTermsInput, VOCABULARY_KEYS, type VocabularyKey } from "@/lib/validation/platform";

type VocabularyPickerProps = {
  types: CenterTypeOption[];
  centerType: string;
  customTerms: CustomTermsInput;
  onTypeChange: (code: string) => void;
  onTermsChange: (terms: CustomTermsInput) => void;
  /** Erreurs par chemin (« centerType », « customTerms.learner.singular »…). */
  errors: Record<string, string | undefined>;
  idPrefix: string;
};

/** Choix du type d'établissement ; saisie de chaque terme pour le type « Personnalisé ». */
export function VocabularyPicker({
  types,
  centerType,
  customTerms,
  onTypeChange,
  onTermsChange,
  errors,
  idPrefix,
}: VocabularyPickerProps) {
  const L = useLabels().platform.newCenter;
  const message = useMessage();
  const selected = types.find((type) => type.code === centerType);

  const setTerm = (key: VocabularyKey, patch: Partial<CustomTermsInput[VocabularyKey]>) =>
    onTermsChange({ ...customTerms, [key]: { ...customTerms[key], ...patch } });

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium">{L.typeLegend}</legend>
        <p className="mb-2 text-caption text-muted-foreground">{L.typeHint}</p>
        <RadioGroup
          value={centerType}
          onValueChange={onTypeChange}
          className="sm:grid-cols-2"
          aria-invalid={errors.centerType ? true : undefined}
        >
          {types.map((type) => (
            <ChoiceItem key={type.code} className="items-start">
              <RadioGroupItem value={type.code} className="mt-0.5" />
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{type.label}</span>
                {!type.isCustom ? (
                  <span className="text-caption text-muted-foreground">
                    {L.preview(type.terms.learner.plural, type.terms.instructor.plural, type.terms.course.plural)}
                  </span>
                ) : null}
              </span>
            </ChoiceItem>
          ))}
        </RadioGroup>
        {errors.centerType ? <p className="text-caption text-danger-ink">{message(errors.centerType)}</p> : null}
      </fieldset>

      {selected?.isCustom ? (
        <fieldset className="flex flex-col gap-4">
          <legend className="font-medium">{L.customTitle}</legend>
          <p className="-mt-2 text-caption text-muted-foreground">{L.customHint}</p>
          {VOCABULARY_KEYS.map((key) => {
            const term = customTerms[key];
            const singularError = errors[`customTerms.${key}.singular`];
            const pluralError = errors[`customTerms.${key}.plural`];
            return (
              <div key={key} className="flex flex-col gap-3 rounded-lg border border-divider p-4">
                <p className="text-caption font-semibold text-heading">{L.termKeys[key]}</p>
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${idPrefix}-${key}-s`}>{L.singular}</Label>
                    <Input
                      id={`${idPrefix}-${key}-s`}
                      value={term.singular}
                      placeholder={selected.terms[key].singular}
                      aria-invalid={singularError ? true : undefined}
                      onChange={(event) => setTerm(key, { singular: event.target.value })}
                    />
                    {singularError ? <p className="text-caption text-danger-ink">{message(singularError)}</p> : null}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${idPrefix}-${key}-p`}>{L.plural}</Label>
                    <Input
                      id={`${idPrefix}-${key}-p`}
                      value={term.plural}
                      placeholder={selected.terms[key].plural}
                      aria-invalid={pluralError ? true : undefined}
                      onChange={(event) => setTerm(key, { plural: event.target.value })}
                    />
                    {pluralError ? <p className="text-caption text-danger-ink">{message(pluralError)}</p> : null}
                  </div>
                  <fieldset className="flex flex-col gap-1.5">
                    <legend className="mb-1.5 text-body font-medium">{L.gender}</legend>
                    <RadioGroup
                      value={term.gender}
                      onValueChange={(value) => setTerm(key, { gender: value === "f" ? "f" : "m" })}
                      className="grid-cols-2"
                    >
                      <ChoiceItem>
                        <RadioGroupItem value="m" />
                        {L.masculine}
                      </ChoiceItem>
                      <ChoiceItem>
                        <RadioGroupItem value="f" />
                        {L.feminine}
                      </ChoiceItem>
                    </RadioGroup>
                  </fieldset>
                </div>
              </div>
            );
          })}
        </fieldset>
      ) : null}
    </div>
  );
}
