import { z } from "zod";

/**
 * Frontera entre `TemplateVersion.configurationSnapshot` (JSON) y el dominio.
 * La forma la produce `createTemplateConfiguration`
 * (`src/modules/catalog/domain/template-configuration.ts`); acá solo se valida al
 * leer, para que un snapshot corrupto no entre al motor de proyección.
 */

const amountSchema = z.string().regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/, {
  message: "El monto almacenado no tiene un formato válido.",
});

const templateRangeSchema = z.object({
  index: z.number().int().positive(),
  minAmount: amountSchema,
  maxAmount: amountSchema,
  installments: z.array(z.number().int().positive()).min(1),
});

const templateSnapshotSchema = z.object({
  currency: z.string().min(3).max(3),
  ranges: z.array(templateRangeSchema).min(1),
});

export type StoredTemplateRange = z.infer<typeof templateRangeSchema>;

export type StoredTemplateConfiguration = {
  currency: string;
  ranges: readonly StoredTemplateRange[];
};

export class InvalidTemplateSnapshotError extends Error {
  readonly code = "CAT-SNAPSHOT-001";

  constructor(message: string) {
    super(message);
    this.name = "InvalidTemplateSnapshotError";
  }
}

export function parseTemplateConfiguration(value: unknown): StoredTemplateConfiguration {
  const parsed = templateSnapshotSchema.safeParse(value);

  if (!parsed.success) {
    throw new InvalidTemplateSnapshotError(
      "El snapshot de configuración de la plantilla no tiene un formato válido.",
    );
  }

  return {
    currency: parsed.data.currency,
    ranges: Object.freeze([...parsed.data.ranges].sort((left, right) => left.index - right.index)),
  };
}
