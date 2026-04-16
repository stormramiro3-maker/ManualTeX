import { useEffect, useRef, useState } from "react";

const PROFILES = {
  structure: [
    { until: 10, label: "Preparando corpus" },
    { until: 25, label: "Armando prompt" },
    { until: 72, label: "La IA está generando la estructura" },
    { until: 90, label: "Validando estructura" }
  ],
  revise: [
    { until: 12, label: "Preparando feedback" },
    { until: 34, label: "Reconstruyendo propuesta" },
    { until: 76, label: "La IA está rehaciendo la estructura" },
    { until: 92, label: "Validando revisión" }
  ],
  generateTex: [
    { until: 8, label: "Preparando contexto" },
    { until: 18, label: "Cargando estructura aprobada" },
    { until: 72, label: "La IA está redactando el manual" },
    { until: 84, label: "Validando salida" },
    { until: 94, label: "Renderizando LaTeX" }
  ],
  compilePdf: [
    { until: 10, label: "Preparando compilación" },
    { until: 38, label: "Ejecutando LaTeX" },
    { until: 72, label: "Resolviendo referencias e índice" },
    { until: 92, label: "Validando PDF generado" }
  ],
  processPdfs: [
    { until: 12, label: "Abriendo ZIP" },
    { until: 30, label: "Leyendo PDFs" },
    { until: 74, label: "Extrayendo texto" },
    { until: 92, label: "Consolidando corpus" }
  ]
};

function getStage(percent, profileName) {
  const profile = PROFILES[profileName] || PROFILES.generateTex;
  for (const step of profile) {
    if (percent <= step.until) return step.label;
  }
  return "Finalizando";
}

export default function useTaskProgress() {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState("Procesando");
  const [detail, setDetail] = useState("La IA está trabajando...");
  const [percent, setPercent] = useState(0);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");

  const timerRef = useRef(null);
  const profileRef = useRef("generateTex");

  const clear = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => clear, []);

  const start = ({
    profile = "generateTex",
    title = "Procesando",
    detail = "La IA está trabajando..."
  } = {}) => {
    clear();
    profileRef.current = profile;
    setVisible(true);
    setTitle(title);
    setDetail(detail);
    setPercent(4);
    setStage(getStage(4, profile));
    setError("");

    timerRef.current = setInterval(() => {
      setPercent((prev) => {
        let next = prev;

        if (prev < 12) next += 2;
        else if (prev < 30) next += 1.5;
        else if (prev < 55) next += 1.1;
        else if (prev < 72) next += 0.7;
        else if (prev < 88) next += 0.35;
        else if (prev < 94) next += 0.18;
        else next = prev;

        const safe = Math.min(next, 94);
        setStage(getStage(safe, profileRef.current));
        return safe;
      });
    }, 500);
  };

  const advanceTo = (value, customStage = "") => {
    const safe = Math.max(0, Math.min(99, value));
    setPercent(safe);
    setStage(customStage || getStage(safe, profileRef.current));
  };

  const fail = (message) => {
    clear();
    setError(message || "Ocurrió un error");
    setStage("Error");
  };

  const finish = (customStage = "Completado") => {
    clear();
    setPercent(100);
    setStage(customStage);

    setTimeout(() => {
      setVisible(false);
      setError("");
    }, 700);
  };

  const reset = () => {
    clear();
    setVisible(false);
    setError("");
    setPercent(0);
    setStage("");
  };

  return {
    progressProps: {
      visible,
      title,
      detail,
      percent,
      stage,
      error
    },
    start,
    advanceTo,
    fail,
    finish,
    reset
  };
}
