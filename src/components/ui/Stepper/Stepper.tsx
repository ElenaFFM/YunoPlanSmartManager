import styles from "./Stepper.module.css";

export type StepStatus = "complete" | "current" | "upcoming";

export function Stepper({ steps }: { steps: { label: string; status: StepStatus }[] }) {
  return (
    <ol className={styles.list}>
      {steps.map((step, index) => (
        <li key={step.label} className={`${styles.step} ${styles[step.status]}`}>
          <span className={styles.index} aria-hidden="true">
            {step.status === "complete" ? "✓" : index + 1}
          </span>
          <span>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}
