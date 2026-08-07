export type InstallmentSet = readonly number[];

export class InvalidInstallmentSetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInstallmentSetError";
  }
}

export function createInstallmentSet(values: InstallmentSet): InstallmentSet {
  if (values.length === 0) {
    throw new InvalidInstallmentSetError("El set de cuotas no puede estar vacío.");
  }

  if (values.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new InvalidInstallmentSetError("Las cuotas deben ser enteros positivos.");
  }

  if (!values.includes(1)) {
    throw new InvalidInstallmentSetError("El set de cuotas debe contener la cuota 1.");
  }

  const uniqueValues = new Set(values);
  if (uniqueValues.size !== values.length) {
    throw new InvalidInstallmentSetError("Las cuotas no pueden repetirse.");
  }

  const descending = [...values].sort((left, right) => right - left);
  if (descending.some((value, index) => value !== values[index])) {
    throw new InvalidInstallmentSetError("Las cuotas deben estar ordenadas de mayor a menor.");
  }

  return Object.freeze([...values]);
}

export function addExactInstallments(
  baseline: InstallmentSet,
  additions: InstallmentSet,
): InstallmentSet {
  createInstallmentSet(baseline);

  const result = [...new Set([...baseline, ...additions])].sort((left, right) => right - left);
  return createInstallmentSet(result);
}

export function capMaximumInstallment(
  baseline: InstallmentSet,
  maximum: number,
): InstallmentSet {
  createInstallmentSet(baseline);

  if (!Number.isInteger(maximum) || maximum <= 0) {
    throw new InvalidInstallmentSetError("El máximo debe ser un entero positivo.");
  }

  return createInstallmentSet(baseline.filter((installment) => installment <= maximum));
}

export function setExactInstallments(installments: InstallmentSet): InstallmentSet {
  return createInstallmentSet(installments);
}

export function restoreBaseline(baseline: InstallmentSet): InstallmentSet {
  return createInstallmentSet(baseline);
}

export type InstallmentTransformation =
  | { type: "ADD_EXACT_INSTALLMENTS"; additions: InstallmentSet }
  | { type: "CAP_MAX_INSTALLMENT"; maximum: number }
  | { type: "SET_EXACT_INSTALLMENTS"; installments: InstallmentSet }
  | { type: "RESTORE_BASELINE" };

export function applyInstallmentTransformation(
  baseline: InstallmentSet,
  transformation: InstallmentTransformation,
): InstallmentSet {
  switch (transformation.type) {
    case "ADD_EXACT_INSTALLMENTS":
      return addExactInstallments(baseline, transformation.additions);
    case "CAP_MAX_INSTALLMENT":
      return capMaximumInstallment(baseline, transformation.maximum);
    case "SET_EXACT_INSTALLMENTS":
      return setExactInstallments(transformation.installments);
    case "RESTORE_BASELINE":
      return restoreBaseline(baseline);
  }
}

