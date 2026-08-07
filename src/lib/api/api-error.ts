export type ValidationSeverity = "ERROR" | "WARNING" | "INFO";

export type ValidationFinding = {
  code: string;
  severity: ValidationSeverity;
  message: string;
  field?: string;
};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly findings: ValidationFinding[];

  constructor(status: number, code: string, message: string, findings: ValidationFinding[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.findings = findings;
  }
}
