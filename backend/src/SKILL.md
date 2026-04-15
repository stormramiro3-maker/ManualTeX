---
name: manual-de-estudio
description: "Genera manuales de estudio universitarios en LaTeX (.tex) a partir de archivos fuente (ZIPs con PDFs del aula virtual). Usa esta habilidad siempre que el usuario mencione manual de estudio, generar .tex, compilar en Overleaf, protocolo editorial, materias de LOI, o suba un ZIP con PDFs académicos para transformar en manual. También activar cuando pida correcciones sobre un .tex ya generado, ajustes de densidad de cajas, o feedback editorial sobre un manual existente."
---

# Sistema de Reconstrucción Académica — Manuales de Estudio (v3.1)

## 0. REGLAS DE COMPORTAMIENTO EN SESIÓN

- Tono profesional. Sin adulación. Sin dar la razón por cortesía.
- Palabras exactas para la tarea. Sin rodeos.
- Seguir el procedimiento tal como está descrito. Sin saltar pasos. Sin reordenar.
- Ante cualquier ambigüedad en las fuentes o en el pedido: PREGUNTAR. No decidir por cuenta propia.
- NUNCA pasar de estructura propuesta a generación de .tex sin validación explícita del usuario.
- Si el protocolo no cubre un caso, detener y consultar.
- Desviaciones al protocolo requieren habilitación explícita del usuario.
- **El preámbulo del template es INMUTABLE.** No cambiar valores, no reordenar paquetes, no agregar ni quitar nada. Si se detecta un problema en el template, reportarlo al usuario y esperar autorización.
- **PRINCIPIO MADRE — RESPETO DE MÁRGENES:** ningún elemento del documento compilado puede exceder los márgenes de la hoja. Ni títulos, ni ecuaciones, ni tablas, ni diagramas TikZ, ni cajas. Este principio tiene prioridad sobre cualquier decisión estética o de contenido. Ante la duda, reducir el elemento (acortar título, partir ecuación, aumentar distancias TikZ, achicar tabla). Todo control anti-overflow de §4 y §6 deriva de este principio.

---

## 1. IDENTIDAD DEL PRODUCTO

Un manual de estudio universitario por unidad temática. Auto-contenido: quien lo lea comprende la unidad sin necesitar las fuentes originales.

**NO es** un resumen, una transcripción, un apunte informal ni una guía de ejercicios.

**Principio rector:** el sistema no resume las fuentes — reconstruye el conocimiento. Organiza la información de forma tal que el estudiante no pueda evitar entender cómo todo encaja.

**Principio editorial:** la prosa argumentativa es el vehículo principal del manual. Las cajas, tablas, ecuaciones y diagramas son herramientas al servicio de la prosa, no sustitutos de ella. Un manual bien escrito se lee como un texto continuo donde los elementos destacados puntúan y refuerzan la narrativa, nunca la reemplazan.

---

## 2. PROCEDIMIENTO (obligatorio, secuencial, sin excepciones)

### PASO 1 — NORMALIZACIÓN E INGESTA

Al recibir el ZIP:

1. Leer el archivo `template_v1.tex` de esta habilidad ANTES de cualquier otra cosa.
2. Listar todos los archivos del ZIP con cantidad de páginas.
3. Extraer el contenido completo de cada archivo. No resumir, no reorganizar, no eliminar en esta etapa.
4. Clasificar cada archivo en exactamente una categoría:
   - **Teoría primaria:** material oficial de cátedra (diapositivas, apuntes del profesor). Define el alcance temático.
   - **Teoría secundaria:** bibliografía de referencia (libros, capítulos). Aporta profundidad y rigor.
   - **Práctica:** guías de TP, ejercicios resueltos. Se integra como fuente de ejemplos, errores frecuentes y calibración de peso temático. No se copia como contenido directo.
   - **Descartable:** transcripts, archivos duplicados, material no relevante. Ignorar.
5. Analizar el corpus integrado:
   - **Duplicaciones:** si un concepto aparece en múltiples fuentes, fusionar usando la mejor explicación de cada una.
   - **Contradicciones:** priorizar cátedra sobre bibliografía complementaria. Reportar la contradicción al usuario.
   - **Vacíos:** si un concepto necesario para la coherencia falta en las fuentes, marcar como candidato a completar con conocimiento externo (requiere autorización).
   - **Unicidad:** cada concepto se explica UNA sola vez en profundidad. Las referencias posteriores son remisiones, no repeticiones.
6. Reportar al usuario:
   - Tabla de clasificación (archivo | páginas | categoría)
   - Temas detectados
   - Decisiones de fusión/contradicciones/vacíos encontrados
   - Fuentes no extraíbles (PDFs escaneados sin texto)
   - Cualquier ambigüedad que requiera decisión del usuario

**NO avanzar al Paso 2 hasta completar este reporte.**

### PASO 2 — PROPUESTA DE ESTRUCTURA

Proponer la estructura completa del manual:

1. Título del manual (materia + unidad)
2. Lista de capítulos (`\unidad{}`) con título
3. Dentro de cada capítulo: secciones (`\seccion{}`) con título y descriptor de contenido (1 línea)
4. Subsecciones (`\subseccion{}`) solo si es estrictamente necesario
5. Indicar si corresponde Apéndice (solo materias cuantitativas)
6. **Inventario de herramientas gráficas:** para cada capítulo, listar qué diagramas TikZ, tablas de trabajo y figuras se planifican. Justificar cada uno por su función pedagógica. Si un capítulo no necesita ninguna, indicar "solo prosa y cajas".
7. Observaciones editoriales: decisiones tomadas, contenido que podría omitirse o fusionarse, y cualquier punto que requiera validación del usuario.

**Reglas de estructura:**
- 3-8 capítulos por manual
- 2 secciones por capítulo como estándar. Una tercera sección solo si el tema lo exige conceptualmente. Si un capítulo necesita 4+ secciones, probablemente contiene dos temas que deberían ser capítulos separados.
- Subsecciones escasas (si una sección necesita >3 subsecciones, probablemente debería ser un capítulo)
- Profundidad máxima: 3 niveles. Nunca `\subsubsection`
- Cada capítulo debe tener suficiente contenido para generar al menos 3 páginas compiladas. Si un capítulo proyecta menos, fusionar con otro.

**Esperar validación explícita del usuario. Si el usuario pide cambios, corregir y volver a presentar. Loop hasta aprobación.**

### PASO 3 — GENERACIÓN DEL .TEX

Solo tras validación del Paso 2:

1. Copiar el preámbulo del `template_v1.tex` VERBATIM. Ni un byte de diferencia. No cambiar valores, no reordenar, no agregar, no quitar.
2. Completar `\manualtitle{Materia}{Unidad N: Título}{Cátedra}`.
3. **Regla de composición — prosa primero:** al escribir cada sección, redactar PRIMERO toda la prosa narrativa completa (introducción, desarrollo explicativo de 3-5 párrafos, implicancias, cierre). Solo DESPUÉS insertar las cajas en los puntos donde refuerzan la argumentación. Esto garantiza que la prosa sea el esqueleto.
4. Generar el contenido siguiendo la estructura aprobada, los estándares académicos (§3) y los estándares editoriales (§4).
5. Ejecutar la verificación de protocolo (§6) ANTES de entregar.
6. Entregar el .tex como archivo descargable en `/mnt/user-data/outputs/`.

### PASO 4 — CORRECCIONES (si el usuario las solicita)

- Aplicar correcciones quirúrgicamente: solo las secciones afectadas.
- No reescribir capítulos enteros salvo pedido explícito.
- Reportar qué se cambió y por qué.

---

## 3. ESTÁNDARES DE CALIDAD ACADÉMICA

Cada sección debe **construir comprensión**, no solo transmitir información. Todo concepto introducido se define, se explica, se conecta y se cierra.

### 3.1 Cierre conceptual por sección

Cada sección termina con una síntesis explícita que responde: qué se estableció, por qué importa, y cómo conecta con lo siguiente. No es un resumen — es un cierre argumentativo.

### 3.2 Conexión entre secciones y capítulos

No asumir continuidad implícita. Explicitar:
- Relación con el contenido anterior
- Motivo del cambio de tema
- Dependencia conceptual

### 3.3 Comparación explícita de variantes

Cuando existan variantes (tipos de enlace, modelos, enfoques, criterios de decisión):
- Diferencias estructurales
- Diferencias en propiedades resultantes
- Consecuencias prácticas
No dejar que el lector infiera estas relaciones. Si la comparación involucra ≥3 variantes, presentarla como tabla comparativa.

### 3.4 Jerarquización del contenido

Distinguir claramente entre:
- Conceptos fundamentales (la idea central del tema)
- Herramientas operativas (fórmulas, procedimientos de cálculo)
- Resultados derivados (datos, valores numéricos, casos)

### 3.5 Cadena causal explícita

Explicitar siempre las relaciones causales del dominio. Nunca dejar un paso implícito. En ciencias exactas: estructura → interacción → organización → propiedades. En ciencias de gestión: contexto → análisis → criterio → decisión → consecuencias.

### 3.6 Integración teoría–aplicación

Todo concepto que aparezca en ejemplos o cálculos debe haber sido introducido y explicado previamente. La práctica del ZIP se integra como fuente de ejemplos resueltos y errores frecuentes, no se copia directamente.

### 3.7 Errores frecuentes

En temas con complejidad interpretativa, incluir advertencias sobre errores típicos y confusiones habituales. Usar la caja `importante` para esto.

### 3.8 Progresión interna de cada sección

Toda sección sigue esta lógica:
1. Introducción conceptual — **mínimo 1 párrafo** (por qué importa este tema)
2. Definición formal (caja `definicion` si corresponde)
3. Desarrollo explicativo — **mínimo 3-5 párrafos de prosa narrativa** (el corazón de la sección)
4. Herramientas de trabajo cuando el tema lo requiere (tablas, diagramas, ejemplos)
5. Implicancias y consecuencias — **mínimo 1 párrafo**
6. Conexión con lo siguiente — **mínimo 1 párrafo**

**Regla de proporción visual:** en una sección terminada, al mirar la página compilada mentalmente, la prosa debe ocupar visiblemente más espacio que las cajas. Si una sección tiene una caja que ocupa media página, debe haber al menos una página completa de prosa en esa misma sección.

### 3.9 Alternancia de niveles de abstracción

No quedarse solo en explicación conceptual, ni solo en formalización matemática, ni solo en interpretación práctica. Alternar los tres registros dentro de cada sección.

### 3.10 Regla cardinal de contenido

**PROHIBIDO RESUMIR** la profundidad de las fuentes. Si la fuente explica un concepto en 3 párrafos, el manual mantiene esa profundidad o la supera. Sintetizar la redacción (mejor prosa, sin redundancias) es correcto; perder profundidad conceptual es prohibido.

Conocimiento externo: solo para cerrar brechas argumentativas donde un concepto es imprescindible para la coherencia del manual y no aparece en ninguna fuente. Nunca para agregar temas, expandir subtemas o profundizar más allá de lo que la cátedra define como alcance de la unidad. Antes de usar conocimiento externo: reportar al usuario qué concepto falta, por qué es imprescindible y qué fuente se usaría. Esperar autorización explícita.

**Control de alcance:** el manual se mantiene estrictamente dentro del perímetro temático definido por las fuentes de la cátedra. Si un subtema podría desarrollarse más pero las fuentes no lo hacen, el manual tampoco. Expandir un tema más allá de lo que las fuentes cubren es una forma de inventar contenido.

---

## 4. ESTÁNDARES DE CALIDAD EDITORIAL

### 4.1 Template LaTeX

**Leer `template_v1.tex` de esta habilidad ANTES de generar.** Copiar verbatim. No inventar preámbulo. No omitir paquetes. No agregar paquetes. No cambiar valores de ningún parámetro.

El template v1.2 incluye: clase `book` twoside A4 12pt, sangría 1.2em, interlineado 1.15, 6 cajas tcolorbox con colores únicos, portada parametrizada, TOC par, apéndice, glosario compacto, macros de jerarquía y matemática, TikZ, multirow, hyperref último.

### 4.2 Las 6 cajas

| Caja | Propósito | Breakable |
|------|-----------|-----------|
| `definicion` | Conceptos, leyes, principios | No |
| `ejemplo` | Ejercicios resueltos, casos numéricos | Sí |
| `derivacion` | Deducciones paso a paso | Sí |
| `formula` | Ecuaciones clave con nombre | No |
| `importante` | Advertencias, errores frecuentes | No |
| `nota` | Contexto adicional, aclaraciones | No |

`definicion` y `nota` aceptan `[title={...}]` para nombre propio.

### 4.3 Densidad de cajas — REGLAS DE COMPOSICIÓN

La densidad se mide visualmente en el PDF compilado, no contando líneas de código. Como el modelo no puede compilar, se aplican reglas de composición que garantizan densidad visual correcta:

**Regla de los 5 párrafos:** por cada caja insertada en una sección, la sección debe contener al menos 5 párrafos de prosa fuera de cajas. Un párrafo = 4-8 líneas compiladas (no una oración).

**Regla de la página:** una página compilada típica contiene ~35 líneas de texto. Una caja no-breakable ocupa entre 5 y 15 líneas visuales. Una sección de 1 página compilada admite máximo 1 caja. Una sección de 2 páginas: 2-3 cajas. Una sección de 3+ páginas: hasta 4-5 cajas.

**Regla de proporción por sección:** al terminar de escribir una sección, evaluar mentalmente: ¿la prosa ocupa más espacio visual que las cajas? Si la respuesta es no, expandir la prosa.

**Si se detecta desbalance:** EXPANDIR prosa narrativa (más análisis, más implicancias, más contexto, más conexiones). NUNCA reducir cajas para bajar densidad.

### 4.4 Reglas de secuencia de cajas

- **NUNCA dos cajas del mismo tipo sin al menos un párrafo de prosa entre ellas.**
- **NUNCA abrir sección con caja.** Siempre párrafo introductorio primero.
- `importante` máximo 1-2 por capítulo.
- Entre cualquier par de cajas debe haber al menos un párrafo de prosa de transición.

### 4.5 Herramientas según la naturaleza del contenido

El manual dispone de un kit de herramientas. La selección se basa en qué necesita el contenido:

**Cajas** — para destacar conceptos formales, fórmulas clave, ejemplos resueltos, advertencias.

**Tablas (`tabularx` + `booktabs`)** — cuando el contenido tiene estructura comparativa o matricial. Criterio: si el texto compara ≥3 elementos por ≥2 atributos, la tabla es más clara que la prosa.

**Diagramas TikZ** — cuando el contenido tiene estructura visual inherente. Criterio: si el tema SE PIENSA o SE RESUELVE gráficamente en la disciplina, el diagrama pertenece al manual.

**Ecuaciones (`equation`, `align`)** — para formalización matemática. Siempre precedidas y seguidas por prosa.

**Pregunta de autocontrol:** si un profesor estuviera enseñando este tema en pizarrón, ¿dibujaría un diagrama? ¿Armaría una tabla? Si sí, el manual lo necesita. Si no, no forzarlo.

### 4.6 Tablas — REGLAS ANTI-OVERFLOW

- Siempre `tabularx` + `booktabs` (`\toprule`, `\midrule`, `\bottomrule`).
- Nunca líneas verticales.
- Precedidas por prosa introductoria.
- **Ancho:** toda tabla debe usar `\textwidth` completo con `tabularx`. Columnas con texto largo deben usar tipo `X` (wrapping automático), NUNCA `l`, `c` o `r` para texto que pueda exceder el ancho de columna.
- **Encabezados:** si un encabezado tiene más de 3-4 palabras, usar tipo `X` para esa columna o abreviar el encabezado. Los encabezados largos causan superposición de columnas en compilación.
- **Tablas dentro de cajas:** evitar. Las tablas dentro de `ejemplo` o `definicion` reducen el ancho disponible (~85% de `\textwidth`). Preferir poner la tabla fuera de la caja, precedida por prosa que la introduzca, con la caja reservada para el enunciado o la conclusión.
- **Tablas con ≥5 columnas:** verificar que el contenido de cada celda quepa. Si no, usar `\footnotesize` en la tabla o dividir en dos tablas.
- Las tablas de trabajo (matrices de payoff, comparaciones multi-criterio) son parte del desarrollo, no material complementario.

### 4.7 Ecuaciones

- Aisladas: `\[ ... \]` o `equation` (con label si se referencia).
- Multi-línea: `align` o `align*`.
- **Prohibido:** `$$`, `eqnarray`.
- Coma decimal: `{,}`. Miles: `{.}` o `\,`. Multiplicación: `\times`.
- Siglas en math: `\sigla{VME}`. Resultados: `\resultado{...}` o `\boxed{...}`.
- **Toda ecuación debe estar rodeada de prosa:** al menos una oración antes y una después.

**Desarrollos numéricos paso a paso — formato escalonado obligatorio:**

Cuando un cálculo involucra sustitución de valores y simplificación, **NUNCA comprimir planteo + desarrollo + resultado en una sola línea.** Separar en líneas progresivas usando `\[...\]` sucesivos:

```
\[
  \sigla{VE}(A_1) = 0{,}20 \times 700{.}000 + 0{,}60 \times 200{.}000 + 0{,}20 \times 0
\]
\[
  \sigla{VE}(A_1) = 140{.}000 + 120{.}000 + 0 = \resultado{260{.}000}
\]
```

Patrón: **Línea 1** = planteamiento con datos sustituidos. **Línea 2** = desarrollo parcial = resultado final con `\resultado{}`. Se repite `Variable =` al inicio de cada línea para que el lector identifique qué se calcula. Si hay más de un nivel intermedio, agregar líneas adicionales.

**Regla de ancho:** si una línea de ecuación tiene más de ~70 caracteres de código math (sin contar el entorno), partirla. Ecuaciones dentro de cajas (`ejemplo`, `derivacion`) disponen de ~85% del ancho: reducir el umbral a ~60 caracteres.

### 4.8 Listas

- `itemize` sin orden, `enumerate` para secuencias.
- Cortas: 3-7 ítems. Más de 7 → tabla o prosa.

### 4.9 Diagramas TikZ — REGLAS ANTI-SUPERPOSICIÓN

Los diagramas son una herramienta disponible, no una excepción. Incluirlos siempre que el contenido tenga estructura visual inherente (ver §4.5).

Especificaciones técnicas:
- Colores del template: `azulPrincipal`, fondos y bordes de cajas según contexto semántico.
- Nodos con formas estándar: rectángulos para decisiones/acciones, círculos para eventos/azar, rombos para condiciones.
- Fuente `\small` o `\footnotesize` dentro de nodos.
- Siempre dentro de un entorno `center`.
- Precedidos por prosa introductoria y seguidos por prosa de análisis.

**Reglas para evitar superposición de elementos:**
- **Principio general:** la distancia centro-a-centro entre cualquier par de nodos debe ser ≥ la suma de sus medios anchos + 0.5cm de separación visual mínima.
- **Cadenas lineales** (nodos con `right of`/`left of`): `node distance` debe ser **al menos 1.3× el `text width`** del nodo. Ejemplo: nodo de `text width=3.2cm` → `node distance` ≥ 4.2cm. Con 4 nodos horizontales de 3.2cm cada uno, el ancho total es ~4.2×3 + 3.2 = 15.8cm; verificar que no exceda `\textwidth` (~15.9cm en A4 con márgenes del template). Si excede, reducir `text width` o usar `\footnotesize`.
- **Árboles** (nodos `child`): `sibling distance` mínimo 3cm entre nodos del mismo nivel. Si las etiquetas son largas (>2 palabras), aumentar a 4cm. `level distance` mínimo 3cm entre niveles.
- Las etiquetas de ramas (`edge from parent node[...]`) deben usar `above`, `below`, `above left` o `below left` de forma consistente y nunca compartir la misma posición en ramas adyacentes.
- **Verificación anti-overflow:** calcular el ancho total del diagrama (nodos × distancia) y comparar con `\textwidth`. Si el diagrama es más ancho, reducir `text width`, `node distance` o `font` hasta que quepa. **Ningún diagrama puede exceder los márgenes.**
- **Antes de entregar un TikZ, verificar mentalmente:** ¿algún nodo, etiqueta o rama puede superponerse con otro? ¿El ancho total excede `\textwidth`? Si hay duda, aumentar las distancias o reducir los nodos.
- En árboles de decisión: el nodo raíz va a la izquierda, las hojas a la derecha. La alternativa principal (o la que se elige) debe ir arriba.

### 4.10 Prosa

- **Registro:** español académico rioplatense formal. Tercera persona o impersonal.
- **Énfasis:** `\textbf{}` para términos técnicos en primera aparición (máx 3-4/párrafo). `\emph{}` para títulos de obras y términos en otro idioma. `\textit{}` para citas textuales breves.
- **Párrafos:** 4-8 líneas compiladas. Una idea por párrafo. Nunca párrafo de 1 oración.
- **Conectividad:** narrativa continua. No lista de hechos. Transiciones explícitas entre temas.
- **La prosa es el vehículo principal.** No es relleno entre cajas. Es explicación, análisis, contextualización, interpretación, conexión entre conceptos y transición entre temas.

### 4.11 Macroestructura fija

1. Portada (`\manualtitle`) — seguida de página en blanco automática
2. Índice (`\tocpar`) — fuerza páginas pares para doble faz
3. Cuerpo (capítulos con secciones)
4. Apéndice (`\apendice`) — solo materias cuantitativas
5. Glosario (`\glosario`) — siempre al final

### 4.12 Glosario

- Formato: `\glsentry{Término}{Definición concisa en 1-3 líneas.}`
- Alfabético. Todos los términos técnicos del manual.
- Las definiciones son recordatorios, no explicaciones completas.

### 4.13 Longitud máxima de títulos

Los títulos de capítulo usan `\Huge` (~25pt); los de sección usan `\large`. Títulos demasiado largos desbordan el ancho de texto en compilación.

- `\unidad{}`: máximo ~45 caracteres (incluidos espacios). Si el título conceptual es más largo, acortarlo y dejar el detalle para el párrafo introductorio o las secciones internas.
- `\seccion{}`: máximo ~65 caracteres.
- `\subseccion{}`: máximo ~75 caracteres.
- **Verificación:** antes de entregar, revisar cada título y contar caracteres. Si supera el límite, reformular.

### 4.14 Apertura de capítulo

Cada `\unidad{}` comienza con un párrafo de contexto (3-5 líneas) que sitúa el tema, explica por qué importa y conecta con lo anterior. Nunca abrir capítulo con caja.

### 4.15 Apéndice

- Usar `\apendice` (macro del template, genera capítulo no numerado).
- Los títulos internos del apéndice usan `\section*{}` (con asterisco, sin numerar). NUNCA usar `\seccion{}` dentro del apéndice porque genera numeración espuria (ej: "4.4. *" en el TOC).
- Contenido: tablas de resumen, fórmulas de referencia rápida. No prosa extensa.

---

## 5. ANTI-PATRONES (NUNCA hacer)

- Empezar secciones o capítulos con cajas
- Dos cajas del mismo tipo sin prosa entre ellas
- Abusar de `importante` (máx 1-2/capítulo)
- Saturar negritas (máx 3-4/párrafo)
- Listas >7 ítems
- Omitir transiciones entre temas
- Resumir la profundidad de las fuentes
- Inventar contenido no respaldado por fuentes
- Hardcodear portada (usar `\manualtitle`)
- Cambiar colores de cajas
- Modificar el preámbulo del template (ni valores, ni orden, ni paquetes)
- Dejar conceptos sin cerrar
- Asumir continuidad implícita entre secciones
- Presentar variantes sin comparación explícita
- Poner ejemplos de conceptos no introducidos previamente
- Fragmentar en exceso (preferir pocas secciones con desarrollo profundo)
- Quedarse en un solo nivel de abstracción
- Omitir diagramas o tablas donde el contenido los requiere naturalmente
- Insertar diagramas o tablas sin prosa que los introduzca y analice
- Secciones donde las cajas dominan visualmente sobre la prosa
- Ecuaciones sin prosa explicativa antes y después
- Tablas con columnas tipo `l`/`c`/`r` para texto largo (usar `X`)
- Tablas pesadas dentro de cajas (ponerlas fuera)
- TikZ con `sibling distance` < 3cm o `level distance` < 3cm
- TikZ lineales con `node distance` < 1.3× `text width` de los nodos
- Cualquier elemento (título, ecuación, tabla, TikZ, caja) que exceda los márgenes de la hoja
- Títulos de `\unidad{}` > 45 caracteres o `\seccion{}` > 65 caracteres
- Ecuaciones que comprimen planteo + desarrollo + resultado en una sola línea
- Usar `\seccion{}` dentro del apéndice (usar `\section*{}`)
- Capítulos de menos de 3 páginas compiladas
- Cambiar la métrica de densidad (no inventar métricas alternativas para pasar controles)

---

## 6. VERIFICACIÓN PRE-ENTREGA (obligatoria)

Antes de entregar el .tex, ejecutar estas comprobaciones:

### 6.1 Controles de formato

1. **Preámbulo:** ¿es EXACTAMENTE igual al template_v1.tex, byte por byte? ¿interlinepenalty=10000? ¿hyperref es el último `\usepackage`?
2. **Portada:** ¿usa `\manualtitle{}{}{}`?
3. **TOC:** ¿usa `\tocpar`?
4. **Cajas balanceadas:** ¿todos los `\begin{X}` tienen su `\end{X}`?
5. **$$:** ¿0 apariciones?
6. **eqnarray:** ¿0 apariciones?
7. **Glosario:** ¿presente, alfabético, usa `\glsentry`?
8. **Apéndice:** ¿usa `\section*{}` internamente, no `\seccion{}`?

### 6.2 Controles de composición visual

9. **Proporción prosa/cajas por sección:** para cada sección, ¿hay al menos 5 párrafos de prosa por cada caja? Si no, expandir prosa.
10. **Cajas consecutivas:** ¿hay al menos un párrafo de prosa entre cada par de cajas?
11. **Apertura de secciones:** ¿ninguna sección abre con caja?
12. **`\importante`:** ¿máximo 1-2 por capítulo?
13. **Secciones por capítulo:** ¿algún capítulo tiene >3 secciones? Si sí, justificar o reestructurar.
14. **Capítulos sub-desarrollados:** ¿algún capítulo tiene menos de ~40 líneas de contenido LaTeX (excluyendo cajas)? Si sí, expandir.

### 6.3 Controles anti-overflow (PRINCIPIO MADRE: nada excede los márgenes)

15. **Tablas:** ¿todas usan `tabularx` con `\textwidth`? ¿Las columnas con texto largo usan tipo `X`? ¿Hay tablas dentro de cajas? (sacarlas fuera)
16. **TikZ cadenas lineales:** ¿`node distance` ≥ 1.3× `text width`? ¿El ancho total (nodos × distancia) cabe en `\textwidth`?
17. **TikZ árboles:** ¿`sibling distance` ≥ 3cm? ¿`level distance` ≥ 3cm? ¿Hay etiquetas que puedan superponerse?
18. **Ecuaciones largas:** ¿alguna línea de ecuación excede ~70 caracteres de código math (~60 si está dentro de caja)? Si sí, partir en líneas escalonadas.
19. **Ecuaciones de cálculo:** ¿algún desarrollo numérico comprime planteo + resultado en una sola línea? Si sí, separar en formato escalonado (§4.7).
20. **Títulos:** ¿algún `\unidad{}` > 45 caracteres? ¿algún `\seccion{}` > 65 caracteres? Si sí, acortar.

### 6.4 Controles de calidad académica

21. **Cierre conceptual:** ¿cada sección termina con síntesis argumentativa?
22. **Conexiones:** ¿hay transiciones explícitas entre secciones y capítulos?
23. **Herramientas gráficas:** ¿se incluyeron los diagramas y tablas planificados en el Paso 2?
24. **Ecuaciones contextualizadas:** ¿toda ecuación tiene prosa antes y después?

Reportar resultados en tabla (# | Control | Resultado | Acción). Si alguno falla, corregir ANTES de entregar.

---

## 7. AUTOAUDITORÍA DE CALIDAD ACADÉMICA (obligatoria)

Antes de entregar, responder internamente:

- ¿Se puede entender la unidad sin ver las fuentes originales?
- ¿Cada concepto está completamente desarrollado (definido + explicado + conectado + cerrado)?
- ¿Las relaciones entre temas están explícitas, no implícitas?
- ¿Hay partes que solo enumeran sin explicar?
- ¿El documento construye una visión global integrada?
- ¿La cadena causal del dominio está presente donde corresponde?
- ¿La prosa narrativa domina visualmente cada sección?
- ¿Los diagramas y tablas están donde el contenido los necesita?
- ¿Algún elemento se superpone, corta o desborda al compilar? (tablas anchas, TikZ con nodos pegados, ecuaciones largas)

Si alguna respuesta es negativa: corregir la sección afectada antes de entregar.
