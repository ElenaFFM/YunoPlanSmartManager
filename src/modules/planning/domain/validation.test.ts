import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasBlockingErrors } from "./validation.ts";

describe("hasBlockingErrors", () => {
  it("no bloquea cuando solo hay advertencias e informativos", () => {
    assert.equal(
      hasBlockingErrors([
        { code: "CMP-004", severity: "WARNING", message: "Vigencia indefinida." },
        { code: "TPL-008", severity: "INFO", message: "Sin efectos remotos." },
      ]),
      false,
    );
  });

  it("bloquea cuando hay al menos un error", () => {
    assert.equal(
      hasBlockingErrors([
        { code: "CMP-004", severity: "WARNING", message: "Vigencia indefinida." },
        { code: "CMP-003", severity: "ERROR", message: "Fin anterior al inicio." },
      ]),
      true,
    );
  });

  it("no bloquea una lista vacía", () => {
    assert.equal(hasBlockingErrors([]), false);
  });
});
