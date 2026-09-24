import type { Metadata } from "next";

import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { LABELS } from "@/lib/constants/labels";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Section } from "./section";

const L = LABELS.styleguide;

export const metadata: Metadata = { title: L.tokens.title };

const SWATCHES = [
  { label: L.swatches.primary, hex: "#1B2A4A", className: "bg-[#1B2A4A]" },
  { label: L.swatches.brand, hex: "#2F6BFF", className: "bg-brand" },
  { label: L.swatches.highlight, hex: "#F2A649", className: "bg-highlight" },
  { label: L.swatches.success, hex: "#1F9D6B", className: "bg-success" },
  { label: L.swatches.danger, hex: "#D64545", className: "bg-danger" },
  { label: L.swatches.warning, hex: "#E8833A", className: "bg-warning" },
  { label: L.swatches.background, hex: "#F6F7F9", className: "bg-[#F6F7F9]" },
  { label: L.swatches.border, hex: "#E3E6EB", className: "bg-[#E3E6EB]" },
  { label: L.swatches.secondaryText, hex: "#6B7280", className: "bg-[#6B7280]" },
  { label: L.swatches.text, hex: "#111827", className: "bg-[#111827]" },
] as const;

const TEXT_SHADES = [
  { label: L.swatches.brand, className: "text-brand-ink" },
  { label: L.swatches.highlight, className: "text-highlight-ink" },
  { label: L.swatches.success, className: "text-success-ink" },
  { label: L.swatches.danger, className: "text-danger-ink" },
  { label: L.swatches.warning, className: "text-warning-ink" },
] as const;

const SPACING = [4, 8, 12, 16, 24, 32, 48, 64] as const;

// Date de démonstration fixe pour un rendu stable.
const DEMO_DATE = new Date("2026-09-24T10:00:00Z");

export default function TokensPage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader title={L.tokens.title} description={L.tokens.description} />

      <Section title={L.sections.colors}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SWATCHES.map((swatch) => (
            <div key={swatch.hex} className="overflow-hidden rounded-xl border bg-card shadow-soft">
              <div className={cn("h-16 border-b", swatch.className)} />
              <div className="flex flex-col gap-0.5 p-3">
                <span className="font-medium">{swatch.label}</span>
                <code className="text-caption text-muted-foreground">{swatch.hex}</code>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title={L.sections.textShades} hint={L.textShadesHint}>
        <Card>
          <CardContent className="flex flex-wrap gap-x-6 gap-y-2">
            {TEXT_SHADES.map((shade) => (
              <span key={shade.className} className={cn("font-medium", shade.className)}>
                {shade.label}
              </span>
            ))}
          </CardContent>
        </Card>
      </Section>

      <Section title={L.sections.typography}>
        <Card>
          <CardContent className="flex flex-col gap-4">
            <p className="text-title">{L.typography.title}</p>
            <p className="text-section">{L.typography.section}</p>
            <p>{L.typography.body}</p>
            <p className="text-caption text-muted-foreground">{L.typography.caption}</p>
            <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <span className="text-caption text-muted-foreground">{L.typography.amount}</span>
                <Money amount={1200} className="text-2xl" />
                <Money amount={48650} className="text-2xl" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-caption text-muted-foreground">{L.typography.date}</span>
                <span className="numeric text-2xl">{formatDate(DEMO_DATE)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title={L.sections.spacing}>
        <Card>
          <CardContent className="flex flex-col gap-3">
            {SPACING.map((value) => (
              <div key={value} className="flex items-center gap-4">
                <span className="numeric w-10 text-right text-caption text-muted-foreground">{value}</span>
                <span className="h-3 rounded-sm bg-brand" style={{ width: value * 2 }} />
              </div>
            ))}
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}
