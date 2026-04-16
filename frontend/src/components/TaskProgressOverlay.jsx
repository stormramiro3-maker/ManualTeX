import React from "react";

export default function TaskProgressOverlay({
  visible,
  title = "Procesando",
  percent = 0,
  stage = "",
  detail = "La IA está trabajando...",
  error = "",
  onClose
}) {
  if (!visible) return null;

  return (
    <div style={styles.backdrop}>
      <div style={styles.modal}>
        <div style={styles.title}>{title}</div>
        <div style={styles.detail}>{detail}</div>

        <div style={styles.barWrap}>
          <div
            style={{
              ...styles.barFill,
              width: `${Math.max(0, Math.min(100, percent))}%`
            }}
          />
        </div>

        <div style={styles.row}>
          <span style={styles.stage}>{stage}</span>
          <span style={styles.percent}>{Math.round(percent)}%</span>
        </div>

        {error ? <div style={styles.error}>{error}</div> : null}

        {error ? (
          <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
            <button style={styles.closeButton} onClick={onClose}>
              Cerrar
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: 16
  },
  modal: {
    width: "min(560px, 100%)",
    background: "#fff",
    borderRadius: 14,
    padding: 20,
    boxShadow: "0 18px 60px rgba(0,0,0,0.18)"
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 8
  },
  detail: {
    fontSize: 14,
    color: "#475569",
    marginBottom: 14
  },
  barWrap: {
    width: "100%",
    height: 12,
    borderRadius: 999,
    background: "#e2e8f0",
    overflow: "hidden"
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
    background: "#2563eb",
    transition: "width 250ms ease"
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: 10,
    gap: 12
  },
  stage: {
    fontSize: 13,
    color: "#334155"
  },
  percent: {
    fontSize: 13,
    fontWeight: 700,
    color: "#0f172a"
  },
  error: {
    marginTop: 12,
    color: "#b91c1c",
    fontSize: 13,
    whiteSpace: "pre-wrap",
    maxHeight: 180,
    overflowY: "auto",
    lineHeight: 1.4,
    border: "1px solid #fecaca",
    background: "#fff5f5",
    padding: 10,
    borderRadius: 8
  },
  closeButton: {
    padding: "8px 14px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 600
  }
};
