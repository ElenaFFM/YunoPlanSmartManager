"use client";

import { useState } from "react";
import { Modal } from "../Modal/Modal";
import { Button } from "../Button/Button";

import styles from "./ConfirmDialog.module.css";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  /** Motivo obligatorio (09_SECURITY_AND_APPROVALS.md §7/§8: toda advertencia aceptada o acción sensible lleva motivo). */
  requireReason?: boolean;
  /** Confirmación reforzada: exige tipear este texto exacto (p. ej. el nombre de la campaña + ambiente). */
  requireTypedConfirmation?: string;
};

/**
 * Nunca "¿estás seguro?" genérico (04_UX_AND_WORKFLOWS.md §9) — la descripción
 * siempre trae el contexto concreto (nombre, ambiente, impacto) desde el llamador.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  tone = "primary",
  onCancel,
  onConfirm,
  requireReason = false,
  requireTypedConfirmation,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState("");
  const [typedConfirmation, setTypedConfirmation] = useState("");

  const reasonMissing = requireReason && reason.trim().length === 0;
  const typedMismatch = Boolean(requireTypedConfirmation) && typedConfirmation !== requireTypedConfirmation;
  const canConfirm = !reasonMissing && !typedMismatch;

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm(reason.trim());
    setReason("");
    setTypedConfirmation("");
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} disabled={!canConfirm} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className={styles.description}>{description}</div>
      {requireReason ? (
        <label className={styles.field}>
          <span>Motivo</span>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} />
        </label>
      ) : null}
      {requireTypedConfirmation ? (
        <label className={styles.field}>
          <span>
            Escribí <strong>{requireTypedConfirmation}</strong> para confirmar
          </span>
          <input value={typedConfirmation} onChange={(event) => setTypedConfirmation(event.target.value)} />
        </label>
      ) : null}
    </Modal>
  );
}
