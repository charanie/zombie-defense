/* 测试用假 Canvas 上下文：只统计图元数量，不做真实绘制 */
module.exports.stubCtx = function () {
  const calls = { fillRect: 0, stroke: 0, fill: 0, arc: 0, fillText: 0, strokeRect: 0 };
  const grad = { addColorStop() {} };
  const ctx = {
    calls, globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
    canvas: { width: 1280, height: 720 },
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, beginPath() {},
    closePath() {}, moveTo() {}, lineTo() {}, arc() { calls.arc++; }, ellipse() {},
    rect() {}, fill() { calls.fill++; }, stroke() { calls.stroke++; },
    fillRect() { calls.fillRect++; }, strokeRect() { calls.strokeRect++; },
    setLineDash() {}, fillText() { calls.fillText++; }, clearRect() {},
    createRadialGradient: () => grad, createLinearGradient: () => grad,
    measureText: () => ({ width: 10 })
  };
  return ctx;
};
