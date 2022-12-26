type GraphData = { value: number; tooltip: string };

const makeBarGraph = (data: GraphData[], xAxisLabel: string, yAxisLabel: string, title: string) => {
  // Make an svg bar graph
  const leftMargin = 40;
  const bottomMargin = 40;
  const width = 500;
  const height = 500;
  const barGap = 2;
  const barWidth = width / data.length - barGap;
  const totalWidth = width + leftMargin * 2;
  const totalHeight = height + bottomMargin * 2;
  let acm = `<svg width='${totalWidth}' height='${totalHeight}'>`;
  acm += `<text text-anchor="middle" x='${totalWidth / 2}' y='${height + bottomMargin - 10}'>${xAxisLabel}</text>`;
  acm += `<text text-anchor="middle" x='${leftMargin - 10}' y='${height / 2}' transform='rotate(-90, ${leftMargin - 10}, ${height / 2})'>${yAxisLabel}</text>`;
  acm += `<text font-size="large" text-anchor="middle" x='${totalWidth / 2}' y='${bottomMargin - 20}'>${title}</text>`;

  const max = Math.max(...data.map((d) => d.value));

  for (let i = 0; i < data.length; i++) {
    const barHeight = (data[i].value / max) * (height - bottomMargin);
    const barX = leftMargin + i * (barWidth + barGap);
    const barY = height - barHeight;
    acm += `<rect x='${barX}' y='${barY}' width='${barWidth}' height='${barHeight}'><title>${data[i].tooltip}</title></rect>`;
  }

  acm += "</svg>";
  return acm;
};

export { GraphData, makeBarGraph };
