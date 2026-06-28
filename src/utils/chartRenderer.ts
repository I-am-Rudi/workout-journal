/** Lightweight SVG chart helpers — no external dependencies. */

const SVG_NS = "http://www.w3.org/2000/svg";

const MAX_LABEL_CHARS = 22;
const MAX_X_AXIS_LABELS = 10;
export const FREQUENCY_UNIT = "×";

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {}
): SVGElementTagNameMap[K] {
  const el = activeDocument.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

export interface BarChartOptions {
  title?: string;
  /** Y-axis label */
  yLabel?: string;
  /** Width in pixels (default: 100% of container). */
  height?: number;
}

/**
 * Render a vertical bar chart into `container`.
 * @param container - HTMLElement to append the SVG into
 * @param labels    - X-axis category labels
 * @param values    - Numeric values (one per label)
 * @param options   - Optional display options
 */
export function renderBarChart(
  container: HTMLElement,
  labels: string[],
  values: number[],
  options: BarChartOptions = {}
): void {
  const { title, yLabel, height = 220 } = options;

  const paddingTop = title ? 36 : 16;
  const paddingBottom = 48; // room for x-axis labels
  const paddingLeft = yLabel ? 52 : 44;
  const paddingRight = 16;

  const svgWidth = Math.max(container.clientWidth || 340, 200);
  const svgHeight = height;
  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  const maxValue = Math.max(...values, 1);
  const barCount = labels.length;
  const barGap = Math.max(2, chartWidth * 0.05 / barCount);
  const barWidth = Math.max(2, (chartWidth - barGap * (barCount + 1)) / barCount);

  const svg = svgEl("svg", {
    width: "100%",
    height: svgHeight,
    viewBox: `0 0 ${svgWidth} ${svgHeight}`,
    preserveAspectRatio: "xMidYMid meet",
    class: "wt-chart-svg",
  });

  // Title
  if (title) {
    const t = svgEl("text", {
      x: svgWidth / 2,
      y: 20,
      "text-anchor": "middle",
      class: "wt-chart-title",
    });
    t.textContent = title;
    svg.appendChild(t);
  }

  // Y-axis label
  if (yLabel) {
    const yl = svgEl("text", {
      x: 12,
      y: paddingTop + chartHeight / 2,
      "text-anchor": "middle",
      transform: `rotate(-90, 12, ${paddingTop + chartHeight / 2})`,
      class: "wt-chart-axis-label",
    });
    yl.textContent = yLabel;
    svg.appendChild(yl);
  }

  // Grid lines + Y-axis tick labels (4 steps)
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const yVal = (maxValue / steps) * i;
    const yPos = paddingTop + chartHeight - (yVal / maxValue) * chartHeight;

    const line = svgEl("line", {
      x1: paddingLeft,
      y1: yPos,
      x2: paddingLeft + chartWidth,
      y2: yPos,
      class: i === 0 ? "wt-chart-axis-line" : "wt-chart-grid-line",
    });
    svg.appendChild(line);

    if (i > 0) {
      const label = svgEl("text", {
        x: paddingLeft - 6,
        y: yPos + 4,
        "text-anchor": "end",
        class: "wt-chart-tick-label",
      });
      label.textContent = Math.round(yVal).toString();
      svg.appendChild(label);
    }
  }

  // Baseline
  const baseline = svgEl("line", {
    x1: paddingLeft,
    y1: paddingTop + chartHeight,
    x2: paddingLeft + chartWidth,
    y2: paddingTop + chartHeight,
    class: "wt-chart-axis-line",
  });
  svg.appendChild(baseline);

  // Bars + x-axis labels
  labels.forEach((label, i) => {
    const value = values[i] ?? 0;
    const barH = (value / maxValue) * chartHeight;
    const x = paddingLeft + barGap * (i + 1) + barWidth * i;
    const y = paddingTop + chartHeight - barH;

    const rect = svgEl("rect", {
      x,
      y,
      width: barWidth,
      height: barH,
      rx: 2,
      ry: 2,
      class: "wt-chart-bar",
    });
    svg.appendChild(rect);

    // Value label on top of bar (only if bar is tall enough)
    if (barH > 14) {
      const valLabel = svgEl("text", {
        x: x + barWidth / 2,
        y: y + 12,
        "text-anchor": "middle",
        class: "wt-chart-bar-value",
      });
      valLabel.textContent = Math.round(value).toString();
      svg.appendChild(valLabel);
    }

    // X-axis label (rotated if many items)
    const xl = svgEl("text", {
      x: x + barWidth / 2,
      y: paddingTop + chartHeight + 14,
      "text-anchor": barCount > 8 ? "end" : "middle",
      transform:
        barCount > 8
          ? `rotate(-40, ${x + barWidth / 2}, ${paddingTop + chartHeight + 14})`
          : "",
      class: "wt-chart-tick-label",
    });
    xl.textContent = label;
    svg.appendChild(xl);
  });

  container.appendChild(svg);
}

export interface HorizontalBarChartOptions {
  title?: string;
  unit?: string;
}

/**
 * Render a horizontal bar chart into `container`.
 * Suitable for "top exercises by frequency".
 */
export function renderHorizontalBarChart(
  container: HTMLElement,
  labels: string[],
  values: number[],
  options: HorizontalBarChartOptions = {}
): void {
  const { title, unit = "" } = options;

  const rowHeight = 28;
  const paddingTop = title ? 36 : 16;
  const paddingBottom = 16;
  const paddingLeft = 8;
  const paddingRight = 40; // space for value labels

  // Reserve enough left-padding for the longest label (estimated ~7px/char)
  const maxLabelLen = Math.max(...labels.map((l) => l.length), 1);
  const labelAreaWidth = Math.min(Math.max(maxLabelLen * 7, 80), 180);

  const svgWidth = Math.max(container.clientWidth || 340, 200);
  const svgHeight = paddingTop + labels.length * rowHeight + paddingBottom;
  const chartWidth = svgWidth - paddingLeft - labelAreaWidth - paddingRight;

  const maxValue = Math.max(...values, 1);

  const svg = svgEl("svg", {
    width: "100%",
    height: svgHeight,
    viewBox: `0 0 ${svgWidth} ${svgHeight}`,
    preserveAspectRatio: "xMidYMid meet",
    class: "wt-chart-svg",
  });

  // Title
  if (title) {
    const t = svgEl("text", {
      x: svgWidth / 2,
      y: 20,
      "text-anchor": "middle",
      class: "wt-chart-title",
    });
    t.textContent = title;
    svg.appendChild(t);
  }

  labels.forEach((label, i) => {
    const value = values[i] ?? 0;
    const barW = (value / maxValue) * chartWidth;
    const y = paddingTop + i * rowHeight;
    const barX = paddingLeft + labelAreaWidth;
    const barY = y + 6;
    const barH = rowHeight - 12;

    // Row background (alternating)
    if (i % 2 === 0) {
      const bg = svgEl("rect", {
        x: paddingLeft,
        y,
        width: svgWidth - paddingLeft,
        height: rowHeight,
        class: "wt-chart-row-bg",
      });
      svg.appendChild(bg);
    }

    // Label
    const lbl = svgEl("text", {
      x: paddingLeft + labelAreaWidth - 8,
      y: y + rowHeight / 2 + 4,
      "text-anchor": "end",
      class: "wt-chart-tick-label",
    });
    lbl.textContent = label.length > MAX_LABEL_CHARS ? label.slice(0, MAX_LABEL_CHARS - 1) + "…" : label;
    svg.appendChild(lbl);

    // Bar
    if (barW > 0) {
      const rect = svgEl("rect", {
        x: barX,
        y: barY,
        width: barW,
        height: barH,
        rx: 3,
        ry: 3,
        class: "wt-chart-bar",
      });
      svg.appendChild(rect);
    }

    // Value label after bar
    const vl = svgEl("text", {
      x: barX + barW + 5,
      y: y + rowHeight / 2 + 4,
      "text-anchor": "start",
      class: "wt-chart-tick-label",
    });
    vl.textContent = `${Math.round(value)}${unit ? " " + unit : ""}`;
    svg.appendChild(vl);
  });

  container.appendChild(svg);
}

/**
 * Render a simple line chart into `container`.
 */
export interface LineChartOptions {
  title?: string;
  yLabel?: string;
  height?: number;
  unit?: string;
}

export function renderLineChart(
  container: HTMLElement,
  labels: string[],
  values: number[],
  options: LineChartOptions = {}
): void {
  const { title, yLabel, height = 220, unit = "" } = options;

  const paddingTop = title ? 36 : 16;
  const paddingBottom = 48;
  const paddingLeft = yLabel ? 52 : 44;
  const paddingRight = 16;

  const svgWidth = Math.max(container.clientWidth || 340, 200);
  const svgHeight = height;
  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  const maxValue = Math.max(...values, 1);
  const n = labels.length;

  if (n < 2) return; // need at least 2 points for a line

  const xStep = chartWidth / (n - 1);

  const pointX = (i: number) => paddingLeft + i * xStep;
  const pointY = (v: number) =>
    paddingTop + chartHeight - (v / maxValue) * chartHeight;

  const svg = svgEl("svg", {
    width: "100%",
    height: svgHeight,
    viewBox: `0 0 ${svgWidth} ${svgHeight}`,
    preserveAspectRatio: "xMidYMid meet",
    class: "wt-chart-svg",
  });

  if (title) {
    const t = svgEl("text", {
      x: svgWidth / 2,
      y: 20,
      "text-anchor": "middle",
      class: "wt-chart-title",
    });
    t.textContent = title;
    svg.appendChild(t);
  }

  if (yLabel) {
    const yl = svgEl("text", {
      x: 12,
      y: paddingTop + chartHeight / 2,
      "text-anchor": "middle",
      transform: `rotate(-90, 12, ${paddingTop + chartHeight / 2})`,
      class: "wt-chart-axis-label",
    });
    yl.textContent = yLabel;
    svg.appendChild(yl);
  }

  // Grid lines
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const yVal = (maxValue / steps) * i;
    const yPos = pointY(yVal);
    const line = svgEl("line", {
      x1: paddingLeft,
      y1: yPos,
      x2: paddingLeft + chartWidth,
      y2: yPos,
      class: i === 0 ? "wt-chart-axis-line" : "wt-chart-grid-line",
    });
    svg.appendChild(line);

    if (i > 0) {
      const lbl = svgEl("text", {
        x: paddingLeft - 6,
        y: yPos + 4,
        "text-anchor": "end",
        class: "wt-chart-tick-label",
      });
      lbl.textContent = Math.round(yVal).toString();
      svg.appendChild(lbl);
    }
  }

  // Baseline
  svg.appendChild(
    svgEl("line", {
      x1: paddingLeft,
      y1: paddingTop + chartHeight,
      x2: paddingLeft + chartWidth,
      y2: paddingTop + chartHeight,
      class: "wt-chart-axis-line",
    })
  );

  // Filled area under line
  const areaPoints = [
    `${pointX(0)},${paddingTop + chartHeight}`,
    ...values.map((v, i) => `${pointX(i)},${pointY(v)}`),
    `${pointX(n - 1)},${paddingTop + chartHeight}`,
  ].join(" ");
  svg.appendChild(
    svgEl("polygon", {
      points: areaPoints,
      class: "wt-chart-area",
    })
  );

  // Line
  const linePoints = values
    .map((v, i) => `${pointX(i)},${pointY(v)}`)
    .join(" ");
  svg.appendChild(
    svgEl("polyline", {
      points: linePoints,
      class: "wt-chart-line",
      fill: "none",
    })
  );

  // Dots + x-axis labels
  labels.forEach((label, i) => {
    const cx = pointX(i);
    const cy = pointY(values[i]);

    // Dot
    svg.appendChild(
      svgEl("circle", {
        cx,
        cy,
        r: 3,
        class: "wt-chart-dot",
      })
    );

    // Tooltip-style value on hover via <title>
    const titleEl = svgEl("title");
    titleEl.textContent = `${label}: ${values[i]}${unit ? " " + unit : ""}`;
    const g = svgEl("g");
    g.appendChild(
      svgEl("circle", {
        cx,
        cy,
        r: 8,
        opacity: 0,
        style: "cursor:default",
      })
    );
    g.appendChild(titleEl);
    svg.appendChild(g);

    // X-axis label (every Nth to avoid crowding)
    const skipEvery = Math.ceil(n / MAX_X_AXIS_LABELS);
    if (i % skipEvery === 0 || i === n - 1) {
      const xl = svgEl("text", {
        x: cx,
        y: paddingTop + chartHeight + 14,
        "text-anchor": n > 8 ? "end" : "middle",
        transform:
          n > 8
            ? `rotate(-40, ${cx}, ${paddingTop + chartHeight + 14})`
            : "",
        class: "wt-chart-tick-label",
      });
      xl.textContent = label;
      svg.appendChild(xl);
    }
  });

  container.appendChild(svg);
}
