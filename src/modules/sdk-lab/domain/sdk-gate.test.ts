import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  installmentsMatch,
  testedHashMatchesCurrentVersion,
  validateCaseResultInput,
  validateGeneratedMatrix,
  type GeneratedCheckpointMatrix,
} from "./sdk-gate.ts";

describe("validateGeneratedMatrix", () => {
  it("SDK-002: checkpoint aplicable sin casos", () => {
    const matrix: GeneratedCheckpointMatrix[] = [
      { checkpoint: { checkpoint: "BEFORE", instant: new Date() }, cases: [] },
    ];
    const findings = validateGeneratedMatrix(matrix);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].code, "SDK-002");
  });

  it("checkpoint NOT_APPLICABLE se omite", () => {
    const matrix: GeneratedCheckpointMatrix[] = [
      { checkpoint: { checkpoint: "AFTER", instant: null, notApplicableReason: "indefinida" }, cases: [] },
    ];
    assert.deepEqual(validateGeneratedMatrix(matrix), []);
  });

  it("SDK-003: falta el monto mínimo o máximo del tramo", () => {
    const matrix: GeneratedCheckpointMatrix[] = [
      {
        checkpoint: { checkpoint: "BEFORE", instant: new Date() },
        cases: [{ scope: "GENERAL", rangeIndex: 1, amountLabel: "INTERIOR", hasTestCard: true }],
      },
    ];
    const findings = validateGeneratedMatrix(matrix);
    assert.ok(findings.some((finding) => finding.code === "SDK-003"));
  });

  it("SDK-004: caso sin tarjeta de prueba", () => {
    const matrix: GeneratedCheckpointMatrix[] = [
      {
        checkpoint: { checkpoint: "BEFORE", instant: new Date() },
        cases: [
          { scope: "GENERAL", rangeIndex: 1, amountLabel: "MIN", hasTestCard: true },
          { scope: "GENERAL", rangeIndex: 1, amountLabel: "MAX", hasTestCard: false },
        ],
      },
    ];
    const findings = validateGeneratedMatrix(matrix);
    assert.ok(findings.some((finding) => finding.code === "SDK-004"));
  });

  it("matriz completa no produce hallazgos", () => {
    const matrix: GeneratedCheckpointMatrix[] = [
      {
        checkpoint: { checkpoint: "BEFORE", instant: new Date() },
        cases: [
          { scope: "GENERAL", rangeIndex: 1, amountLabel: "MIN", hasTestCard: true },
          { scope: "GENERAL", rangeIndex: 1, amountLabel: "MAX", hasTestCard: true },
        ],
      },
    ];
    assert.deepEqual(validateGeneratedMatrix(matrix), []);
  });
});

describe("validateCaseResultInput", () => {
  it("NOT_APPLICABLE sin justificación falla SDK-006", () => {
    const findings = validateCaseResultInput({ result: "NOT_APPLICABLE" });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].code, "SDK-006");
  });

  it("NOT_APPLICABLE con justificación pasa", () => {
    assert.deepEqual(
      validateCaseResultInput({ result: "NOT_APPLICABLE", justification: "no aplica en este tramo" }),
      [],
    );
  });

  it("PASSED/FAILED nunca requieren justificación", () => {
    assert.deepEqual(validateCaseResultInput({ result: "PASSED" }), []);
    assert.deepEqual(validateCaseResultInput({ result: "FAILED" }), []);
  });
});

describe("installmentsMatch", () => {
  it("compara orden y longitud", () => {
    assert.equal(installmentsMatch([12, 6, 1], [12, 6, 1]), true);
    assert.equal(installmentsMatch([12, 6, 1], [12, 6]), false);
    assert.equal(installmentsMatch([12, 6, 1], [12, 1, 6]), false);
  });
});

describe("testedHashMatchesCurrentVersion", () => {
  it("compara igualdad exacta de hash", () => {
    assert.equal(testedHashMatchesCurrentVersion("abc", "abc"), true);
    assert.equal(testedHashMatchesCurrentVersion("abc", "def"), false);
  });
});
