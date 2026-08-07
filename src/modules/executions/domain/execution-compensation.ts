export type CompensatableOperationType = "CREATE" | "UPDATE" | "DELETE";

export type CompensationOperationType = "COMPENSATE_CREATE" | "COMPENSATE_UPDATE" | "COMPENSATE_DELETE";

export type CompensatableOperation = {
  type: CompensatableOperationType;
  targetRemotePlanId?: string | null;
  compensationSnapshot?: unknown;
  /** Solo para CREATE: el `RemotePlan` local creado al confirmarse, resuelto en ejecución. */
  createdRemotePlanId?: string | null;
};

export type CompensationOperationPlan = {
  type: CompensationOperationType;
  targetRemotePlanId?: string;
  requestSnapshot?: unknown;
};

export class MissingCompensationDataError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MissingCompensationDataError";
    this.code = code;
  }
}

/**
 * Traduce una operación ya confirmada a su compensación, según la tabla de
 * 07_YUNO_EXECUTION.md §6: crear se compensa borrando lo nuevo, actualizar se
 * compensa restaurando el snapshot previo, borrar se compensa recreando desde
 * el snapshot previo. Los datos deben existir siempre que el planificador
 * construyó bien el plan (o, para CREATE, siempre que el propio worker haya
 * registrado el `RemotePlan` resultante); si faltan es un error duro, no un
 * caso ambiguo a tolerar en silencio.
 */
export function buildCompensationOperation(original: CompensatableOperation): CompensationOperationPlan {
  switch (original.type) {
    case "CREATE": {
      if (!original.createdRemotePlanId) {
        throw new MissingCompensationDataError(
          "EXEC-COMP-001",
          "No se puede compensar un CREATE confirmado sin el plan remoto que creó.",
        );
      }
      return { type: "COMPENSATE_DELETE", targetRemotePlanId: original.createdRemotePlanId };
    }
    case "UPDATE": {
      if (!original.targetRemotePlanId) {
        throw new MissingCompensationDataError(
          "EXEC-COMP-002",
          "No se puede compensar un UPDATE sin el plan remoto objetivo.",
        );
      }
      if (original.compensationSnapshot === undefined || original.compensationSnapshot === null) {
        throw new MissingCompensationDataError(
          "EXEC-COMP-003",
          "Falta el snapshot previo al UPDATE; el plan debió capturarlo al construirse.",
        );
      }
      return {
        type: "COMPENSATE_UPDATE",
        targetRemotePlanId: original.targetRemotePlanId,
        requestSnapshot: original.compensationSnapshot,
      };
    }
    case "DELETE": {
      if (original.compensationSnapshot === undefined || original.compensationSnapshot === null) {
        throw new MissingCompensationDataError(
          "EXEC-COMP-004",
          "Falta el payload previo al DELETE; el plan debió capturarlo al construirse.",
        );
      }
      return { type: "COMPENSATE_CREATE", requestSnapshot: original.compensationSnapshot };
    }
  }
}
