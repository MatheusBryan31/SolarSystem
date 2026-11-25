const assert = require('node:assert/strict');
const axe = require('axe-core');

async function accessibility(page, context) {
  await page.evaluate(axe.source);
  const violations = await page.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
    return result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }));
  });
  assert.deepEqual(violations, [], `Acessibilidade ${context}: ${JSON.stringify(violations)}`);
}
module.exports = { accessibility };
