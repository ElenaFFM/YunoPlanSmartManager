import { computeCanonicalHash } from "../../planning/domain/canonical-hash.ts";

export type ExecutionPlanOperationType = "CREATE" | "UPDATE" | "DELETE" | "VERIFY";

export type ExecutionPlanOperation = {
  type: ExecutionPlanOperationType;
  targetRemotePlanId?: string;
  requestSnapshot?: unknown;
  expectedResultSnapshot?: unknown;
  compensationSnapshot?: unknown;
};

export type ExecutionPlanInput = {
  configurationHash: string;
  baseSnapshotHash: string;
  lockKey: string;
  operations: readonly ExecutionPlanOperation[];
};

export type ExecutionPlan = Omit<ExecutionPlanInput, "operations"> & {
  planHash: string;
  operations: readonly (ExecutionPlanOperation & { sequence: number })[];
};

export class InvalidExecutionPlanError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "InvalidExecutionPlanError";
    this.code = code;
  }
}

/**
 * Construye el artefacto inmutable que se persiste antes de encolar. La UI no
 * lo arma: un planificador server-side aporta las operaciones concretas.
 */
export function buildExecutionPlan(input: ExecutionPlanInput): ExecutionPlan {
  if (!input.configurationHash || !input.baseSnapshotHash || !input.lockKey) {
    throw new InvalidExecutionPlanError("EXEC-PLAN-001", "Faltan hashes o lock del plan ejecutable.");
  }
  if (input.operations.length === 0) {
    throw new InvalidExecutionPlanError("EXEC-PLAN-002", "Un plan ejecutable requiere al menos una operación.");
  }

  let deleteSeen = false;
  const operations = input.operations.map((operation, index) => {
    if (operation.type === "VERIFY" && (!operation.targetRemotePlanId || !operation.expectedResultSnapshot)) {
      throw new InvalidExecutionPlanError(
        "EXEC-PLAN-003",
        "VERIFY requiere un plan remoto objetivo y un baseline esperado.",
      );
    }
    if ((operation.type === "UPDATE" || operation.type === "DELETE") && !operation.targetRemotePlanId) {
      throw new InvalidExecutionPlanError("EXEC-PLAN-004", `${operation.type} requiere un plan remoto objetivo.`);
    }
    if (operation.type === "CREATE" && !operation.requestSnapshot) {
      throw new InvalidExecutionPlanError("EXEC-PLAN-005", "CREATE requiere un payload generado por servidor.");
    }
    if (operation.type === "DELETE") deleteSeen = true;
    else if (deleteSeen) {
      throw new InvalidExecutionPlanError(
        "EXEC-PLAN-006",
        "DELETE debe ubicarse al final, después de crear, actualizar y verificar reemplazos.",
      );
    }
    return { ...operation, sequence: index + 1 };
  });

  const planHash = computeCanonicalHash({
    version: 1,
    configurationHash: input.configurationHash,
    baseSnapshotHash: input.baseSnapshotHash,
    lockKey: input.lockKey,
    operations,
  });
  return { ...input, operations, planHash };
}
