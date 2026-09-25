"use client";

import { ChoiceItem } from "@/components/shared/choice-item";
import { Checkbox } from "@/components/ui/checkbox";
import type { LevelWithSubjects } from "@/lib/data/assistant";

type AssignmentPickerProps = {
  levels: LevelWithSubjects[];
  value: string[];
  onChange: (subjectIds: string[]) => void;
};

/** Matières enseignées, groupées par niveau (cases de 44 px). */
export function AssignmentPicker({ levels, value, onChange }: AssignmentPickerProps) {
  return (
    <div className="flex flex-col gap-4">
      {levels
        .filter((level) => level.subjects.length > 0)
        .map((level) => (
          <fieldset key={level.id} className="flex flex-col gap-2">
            <legend className="mb-2 text-caption font-medium text-muted-foreground uppercase">{level.name}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {level.subjects.map((subject) => (
                <ChoiceItem key={subject.id}>
                  <Checkbox
                    checked={value.includes(subject.id)}
                    onCheckedChange={(checked) =>
                      onChange(
                        checked === true
                          ? [...new Set([...value, subject.id])]
                          : value.filter((id) => id !== subject.id),
                      )
                    }
                  />
                  {subject.name}
                </ChoiceItem>
              ))}
            </div>
          </fieldset>
        ))}
    </div>
  );
}
