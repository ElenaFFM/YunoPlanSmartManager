import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTemporalRules,
  campaignTargetKey,
  classifyCampaignChange,
  computeCampaignMaterialHash,
  validateCampaignConfiguration,
  type CampaignConfiguration,
} from "./campaign.ts";
import { diffTimelineSegments } from "./installment-diff.ts";
import { createInstallmentSet } from "./installments.ts";
import { projectInstallmentTimeline } from "./timeline.ts";
import { hasBlockingErrors } from "./validation.ts";

const START = new Date("2026-08-08T00:00:00-03:00");
const END = new Date("2026-08-20T00:00:00-03:00");

function validConfiguration(): CampaignConfiguration {
  return {
    name: "Baja de 24 a 18",
    changeReason: "Fin del acuerdo comercial",
    segments: [
      {
        id: "seg-bna",
        target: { type: "BANK", bankId: "bna" },
        startAt: START,
        endAt: END,
        rangeChanges: [{ rangeIndex: 4, transformation: { type: "CAP_MAX_INSTALLMENT", maximum: 18 } }],
      },
    ],
  };
}

function codes(findings: readonly { code: string }[]): string[] {
  return findings.map((finding) => finding.code);
}

describe("validateCampaignConfiguration", () => {
  it("acepta una configuración completa sin hallazgos", () => {
    const findings = validateCampaignConfiguration(validConfiguration());

    assert.deepEqual(findings, []);
    assert.equal(hasBlockingErrors(findings), false);
  });

  it("CMP-001: exige nombre, motivo y al menos un alcance con cambios", () => {
    const findings = validateCampaignConfiguration({
      name: "   ",
      changeReason: "",
      segments: [],
    });

    assert.deepEqual(codes(findings), ["CMP-001", "CMP-001", "CMP-001"]);
    assert.equal(hasBlockingErrors(findings), true);
  });

  it("CMP-001: marca un alcance sin cambios en ningún tramo", () => {
    const configuration = validConfiguration();
    const findings = validateCampaignConfiguration({
      ...configuration,
      segments: [{ ...configuration.segments[0], rangeChanges: [] }],
    });

    assert.deepEqual(codes(findings), ["CMP-001"]);
  });

  it("CMP-002: rechaza una fecha de inicio inválida", () => {
    const configuration = validConfiguration();
    const findings = validateCampaignConfiguration({
      ...configuration,
      segments: [{ ...configuration.segments[0], startAt: new Date("no-es-una-fecha") }],
    });

    assert.deepEqual(codes(findings), ["CMP-002"]);
  });

  it("CMP-003: exige que el fin sea posterior al inicio", () => {
    const configuration = validConfiguration();
    const findings = validateCampaignConfiguration({
      ...configuration,
      segments: [{ ...configuration.segments[0], endAt: START }],
    });

    assert.deepEqual(codes(findings), ["CMP-003"]);
  });

  it("CMP-004: advierte una vigencia indefinida sin confirmar, sin bloquear", () => {
    const configuration = validConfiguration();
    const findings = validateCampaignConfiguration({
      ...configuration,
      segments: [{ ...configuration.segments[0], endAt: null }],
    });

    assert.deepEqual(codes(findings), ["CMP-004"]);
    assert.equal(findings[0].severity, "WARNING");
    assert.equal(hasBlockingErrors(findings), false);
  });

  it("CMP-004: no advierte cuando la vigencia indefinida está confirmada", () => {
    const configuration = validConfiguration();
    const findings = validateCampaignConfiguration({
      ...configuration,
      segments: [{ ...configuration.segments[0], endAt: null, indefiniteConfirmed: true }],
    });

    assert.deepEqual(findings, []);
  });

  it("CMP-005: rechaza dos configuraciones superpuestas del mismo banco", () => {
    const configuration = validConfiguration();
    const findings = validateCampaignConfiguration({
      ...configuration,
      segments: [
        configuration.segments[0],
        { ...configuration.segments[0], id: "seg-bna-2", startAt: new Date("2026-08-10T00:00:00-03:00") },
      ],
    });

    assert.deepEqual(codes(findings), ["CMP-005"]);
  });

  it("CMP-005: acepta dos configuraciones consecutivas del mismo banco", () => {
    const configuration = validConfiguration();
    const findings = validateCampaignConfiguration({
      ...configuration,
      segments: [
        configuration.segments[0],
        { ...configuration.segments[0], id: "seg-bna-2", startAt: END, endAt: new Date("2026-09-01T00:00:00-03:00") },
      ],
    });

    assert.deepEqual(findings, []);
  });

  it("CMP-006: rechaza dos configuraciones General superpuestas", () => {
    const configuration = validConfiguration();
    const general = { ...configuration.segments[0], target: { type: "GENERAL" } as const };
    const findings = validateCampaignConfiguration({
      ...configuration,
      segments: [general, { ...general, id: "seg-general-2" }],
    });

    assert.deepEqual(codes(findings), ["CMP-006"]);
  });

  it("no reporta superposición entre alcances distintos", () => {
    const configuration = validConfiguration();
    const findings = validateCampaignConfiguration({
      ...configuration,
      segments: [
        configuration.segments[0],
        { ...configuration.segments[0], id: "seg-general", target: { type: "GENERAL" } },
      ],
    });

    assert.deepEqual(findings, []);
  });

  it("CMP-007: rechaza un tramo repetido o inválido dentro de un alcance", () => {
    const configuration = validConfiguration();
    const repeated = validateCampaignConfiguration({
      ...configuration,
      segments: [
        {
          ...configuration.segments[0],
          rangeChanges: [
            { rangeIndex: 4, transformation: { type: "CAP_MAX_INSTALLMENT", maximum: 18 } },
            { rangeIndex: 4, transformation: { type: "ADD_EXACT_INSTALLMENTS", additions: [24] } },
          ],
        },
      ],
    });
    const invalid = validateCampaignConfiguration({
      ...configuration,
      segments: [
        {
          ...configuration.segments[0],
          rangeChanges: [{ rangeIndex: 0, transformation: { type: "RESTORE_BASELINE" } }],
        },
      ],
    });

    assert.deepEqual(codes(repeated), ["CMP-007"]);
    assert.deepEqual(codes(invalid), ["CMP-007"]);
  });

  it("CMP-007: rechaza un tramo que no existe para el alcance según el catálogo real", () => {
    const configuration = validConfiguration();
    const validRangeIndexes = new Map([
      [campaignTargetKey({ type: "BANK", bankId: "bna" }), [1, 2, 3]],
    ]);

    const findings = validateCampaignConfiguration(configuration, validRangeIndexes);

    assert.deepEqual(codes(findings), ["CMP-007"]);
    assert.match(findings[0].message, /no tiene un tramo 4/);
  });

  it("CMP-007: no chequea límites de tramo cuando no se provee el catálogo", () => {
    // Comportamiento previo a esta validación: sin información del catálogo,
    // no se puede saber qué tramos existen, así que no se bloquea.
    const findings = validateCampaignConfiguration(validConfiguration());

    assert.deepEqual(findings, []);
  });

  it("CMP-007: acepta un tramo que sí existe según el catálogo real", () => {
    const configuration = validConfiguration();
    const validRangeIndexes = new Map([
      [campaignTargetKey({ type: "BANK", bankId: "bna" }), [1, 2, 3, 4]],
    ]);

    assert.deepEqual(validateCampaignConfiguration(configuration, validRangeIndexes), []);
  });
});

describe("classifyCampaignChange", () => {
  it("clasifica un renombre como cosmético, sin cambiar el hash material", () => {
    const before = validConfiguration();
    const after = { ...before, name: "Baja de 24 a 18 (revisada)", description: "Ajuste de texto" };

    assert.equal(classifyCampaignChange(before, after), "COSMETIC");
    assert.equal(computeCampaignMaterialHash(before), computeCampaignMaterialHash(after));
  });

  it("clasifica un cambio de motivo como cosmético", () => {
    const before = validConfiguration();
    const after = { ...before, changeReason: "Otro motivo" };

    assert.equal(classifyCampaignChange(before, after), "COSMETIC");
  });

  it("clasifica un cambio de cuotas como material", () => {
    const before = validConfiguration();
    const after: CampaignConfiguration = {
      ...before,
      segments: [
        {
          ...before.segments[0],
          rangeChanges: [{ rangeIndex: 4, transformation: { type: "CAP_MAX_INSTALLMENT", maximum: 12 } }],
        },
      ],
    };

    assert.equal(classifyCampaignChange(before, after), "MATERIAL");
    assert.notEqual(computeCampaignMaterialHash(before), computeCampaignMaterialHash(after));
  });

  it("clasifica un cambio de fecha como material", () => {
    const before = validConfiguration();
    const after: CampaignConfiguration = {
      ...before,
      segments: [{ ...before.segments[0], endAt: new Date("2026-08-21T00:00:00-03:00") }],
    };

    assert.equal(classifyCampaignChange(before, after), "MATERIAL");
  });

  it("clasifica un cambio de banco como material", () => {
    const before = validConfiguration();
    const after: CampaignConfiguration = {
      ...before,
      segments: [{ ...before.segments[0], target: { type: "BANK", bankId: "naranja" } }],
    };

    assert.equal(classifyCampaignChange(before, after), "MATERIAL");
  });

  it("no considera cambio reordenar los segmentos", () => {
    const base = validConfiguration();
    const second = {
      ...base.segments[0],
      id: "seg-general",
      target: { type: "GENERAL" } as const,
    };
    const before: CampaignConfiguration = { ...base, segments: [base.segments[0], second] };
    const after: CampaignConfiguration = { ...base, segments: [second, base.segments[0]] };

    assert.equal(classifyCampaignChange(before, after), "UNCHANGED");
  });

  it("no considera cambio dos fechas que representan el mismo instante", () => {
    const before = validConfiguration();
    const after: CampaignConfiguration = {
      ...before,
      segments: [{ ...before.segments[0], startAt: new Date("2026-08-08T03:00:00Z") }],
    };

    assert.equal(classifyCampaignChange(before, after), "UNCHANGED");
  });

  it("no considera material confirmar una vigencia indefinida", () => {
    const base = validConfiguration();
    const before: CampaignConfiguration = {
      ...base,
      segments: [{ ...base.segments[0], endAt: null }],
    };
    const after: CampaignConfiguration = {
      ...base,
      segments: [{ ...base.segments[0], endAt: null, indefiniteConfirmed: true }],
    };

    assert.equal(computeCampaignMaterialHash(before), computeCampaignMaterialHash(after));
    assert.equal(classifyCampaignChange(before, after), "COSMETIC");
  });
});

describe("buildTemporalRules", () => {
  it("solo devuelve reglas del alcance y tramo pedidos", () => {
    const base = validConfiguration();
    const configuration: CampaignConfiguration = {
      ...base,
      segments: [
        base.segments[0],
        { ...base.segments[0], id: "seg-general", target: { type: "GENERAL" } },
      ],
    };

    assert.deepEqual(
      buildTemporalRules(configuration, { type: "BANK", bankId: "bna" }, 4).map((rule) => rule.id),
      ["seg-bna"],
    );
    assert.deepEqual(buildTemporalRules(configuration, { type: "BANK", bankId: "bna" }, 1), []);
    assert.deepEqual(buildTemporalRules(configuration, { type: "AMEX" }, 4), []);
  });

  it("ordena las reglas por fecha de inicio", () => {
    const base = validConfiguration();
    const later = { ...base.segments[0], id: "seg-tarde", startAt: END, endAt: null };
    const configuration: CampaignConfiguration = { ...base, segments: [later, base.segments[0]] };

    assert.deepEqual(
      buildTemporalRules(configuration, { type: "BANK", bankId: "bna" }, 4).map((rule) => rule.id),
      ["seg-bna", "seg-tarde"],
    );
  });

  it("UC-01 de punta a punta: campaña -> reglas -> proyección -> diff", () => {
    const baseline = createInstallmentSet([24, 12, 9, 6, 3, 1]);
    const configuration: CampaignConfiguration = {
      name: "Baja de 24 a 18",
      changeReason: "Fin del acuerdo comercial",
      segments: [
        {
          id: "cap-18",
          target: { type: "BANK", bankId: "bna" },
          startAt: START,
          endAt: null,
          indefiniteConfirmed: true,
          rangeChanges: [
            { rangeIndex: 4, transformation: { type: "CAP_MAX_INSTALLMENT", maximum: 18 } },
          ],
        },
      ],
    };

    assert.deepEqual(validateCampaignConfiguration(configuration), []);

    const rules = buildTemporalRules(configuration, { type: "BANK", bankId: "bna" }, 4);
    const segments = projectInstallmentTimeline(baseline, rules);
    const diffs = diffTimelineSegments(segments);

    assert.equal(segments.length, 2);
    assert.deepEqual(segments[0].installments, baseline);
    assert.equal(segments[0].endAt?.getTime(), START.getTime());
    assert.deepEqual(segments[1].installments, [12, 9, 6, 3, 1]);
    assert.equal(segments[1].endAt, null);

    assert.equal(diffs[0].changeFromPrevious, null);
    assert.deepEqual(diffs[1].changeFromPrevious?.removed, [24]);
    assert.deepEqual(diffs[1].changeFromPrevious?.added, []);
  });
});
