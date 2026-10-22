import { equipmentChain } from './equipment.mjs';
import { manufacturingChain } from './manufacturing.mjs';

export const valueChains = {
  'optimization-methods': equipmentChain,
  'glasswing-hackathon': manufacturingChain,
};

const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function stageButton(chain, stage, index) {
  const selected = chain.defaultStage === stage.id;
  const extra = chain.kind === 'equipment' && stage.id === 'production'
    ? '<span class="vc-factories" aria-label="Two factories"><span>Factory A</span><span>Factory B</span></span>' : '';
  const summary = chain.kind === 'equipment' && stage.id === 'components' ? '100% capacity available'
    : chain.kind === 'equipment' && stage.id === 'outcome' ? '97.5% of demand served' : stage.summary;
  return `<button type="button" class="vc-stage" id="vc-button-${stage.id}" data-vc-stage="${stage.id}" aria-pressed="${selected}" aria-controls="vc-panel-${stage.id}"><span class="vc-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><span class="vc-stage-name">${esc(stage.label)}</span><span class="vc-stage-summary"${chain.kind === 'equipment' ? ` data-vc-summary="${stage.id}"` : ''}>${esc(summary)}</span>${extra}</button>`;
}

function stagePanel(chain, stage) {
  const linkComparison = chain.kind === 'manufacturing' && stage.id === 'build' ? '<dl class="vc-link-comparison"><div><dt>Selected commitment</dt><dd>COM-0054</dd></div><div><dt>Linked work order belongs to</dt><dd>COM-0038 <span>via WO-0014</span></dd></div></dl>' : '';
  return `<section class="vc-panel" data-vc-panel="${stage.id}" id="vc-panel-${stage.id}" aria-labelledby="vc-question-${stage.id}"${chain.defaultStage === stage.id ? '' : ' hidden'}>
    <div class="vc-panel-heading"><span class="vc-kicker">${esc(stage.label)}</span><h3 id="vc-question-${stage.id}">${esc(stage.question)}</h3><p>${esc(stage.work)}</p></div>
    ${linkComparison}
    <dl class="vc-detail-grid"><div><dt>Who decides</dt><dd>${esc(stage.owner)}</dd></div><div><dt>What could block it</dt><dd>${esc(stage.constraint)}</dd></div><div><dt>Why it matters</dt><dd>${esc(stage.value)}</dd></div></dl>
    <details class="vc-evidence"><summary>Evidence & next check</summary><div><p><strong>${esc(stage.evidence.label)}.</strong> ${esc(stage.evidence.text)}</p><p><strong>Next check.</strong> ${esc(stage.next)}</p></div></details>
  </section>`;
}

export function renderValueChain(chain) {
  const network = chain.kind === 'equipment';
  const mainStages = network ? chain.stages.filter(stage => stage.id !== 'inventory') : chain.stages;
  const inventory = network ? chain.stages.find(stage => stage.id === 'inventory') : null;
  return `<section class="vc-explorer vc-${chain.kind}" id="approach" aria-labelledby="value-chain-title" data-value-chain="${chain.kind}">
    <div class="vc-heading"><p class="vc-kicker">Explore the value chain</p><h2 id="value-chain-title">${esc(chain.title)}</h2><p>${esc(chain.intro)}</p></div>
    <p class="vc-scope">${esc(chain.scope)}</p>
    <p class="vc-instruction">Select a stage to see the decision behind it.</p>
    <div class="vc-map" role="group" aria-label="Value chain stages">
      <ol class="vc-stages" data-vc-count="${mainStages.length}">${mainStages.map((stage, index) => `<li>${stageButton(chain, stage, index)}</li>`).join('')}</ol>
      ${inventory ? `<div class="vc-carryover"><span class="vc-carryover-label">From production</span>${stageButton(chain, inventory, 4)}<span class="vc-carryover-label">Back to shipments<br />in a later month <span aria-hidden="true">↗</span></span></div><p class="vc-flow-note"><strong>Planning input:</strong> the demand forecast informs purchasing, production, and shipment decisions. Inventory carryover is optional.</p>` : ''}
      ${chain.kind === 'manufacturing' ? '<p class="vc-flow-note">Arrows show linked business checkpoints—not a conversion of quantities.</p>' : ''}
    </div>
    <div class="vc-panels">${chain.stages.map(stage => stagePanel(chain, stage)).join('')}</div>
    <button class="vc-back" type="button" data-vc-back>Back to stages <span aria-hidden="true">↑</span></button>
    <p class="sr-only" data-vc-announcement role="status" aria-live="polite"></p>
    ${chain.checks ? `<details class="vc-checks"><summary>Four checks that run across the chain</summary><dl>${chain.checks.map(check => `<div><dt>${esc(check.label)}</dt><dd>${esc(check.text)}</dd></div>`).join('')}</dl></details>` : ''}
    <noscript><p>Stage controls need JavaScript. The selected stage and the example below remain available.</p></noscript>
  </section>`;
}

export function renderChainExample(chain, study) {
  if (chain.kind === 'equipment') {
    return `<section class="vc-worked-example" id="findings" aria-labelledby="findings-title"><p class="vc-kicker">Reported model results</p><h2 id="findings-title">What changes when supply falls?</h2><p class="vc-example-intro">Explore three reported scenarios—not a live optimization run.</p>
      <div class="vc-scenario-controls" role="group" aria-label="Reported supply scenarios">${chain.scenarios.map((scenario, index) => `<button type="button" data-vc-scenario="${scenario.capacity}" data-vc-served="${scenario.served}" aria-pressed="${index === 0}" aria-controls="vc-scenario-${scenario.capacity}">${esc(scenario.label)}</button>`).join('')}</div>
      <div class="vc-scenario-results" aria-live="polite" aria-atomic="true">${chain.scenarios.map((scenario, index) => `<div id="vc-scenario-${scenario.capacity}" data-vc-scenario-panel="${scenario.capacity}"${index ? ' hidden' : ''}><div class="vc-result"><p><strong>${scenario.served}%</strong><span>of modeled demand served</span></p><p class="vc-result-explanation">${esc(scenario.text)}</p></div><div class="vc-result-bar" aria-hidden="true"><span class="vc-percent-${String(scenario.served).replace('.','-')}"></span></div><p class="vc-result-caption">Supplier capacity available: ${scenario.capacity}% · Same demand forecast across scenarios</p></div>`).join('')}</div>
      <p class="vc-source-note">${esc(study.example.note)}</p>
      <details class="vc-evidence"><summary>How the constraint moves through the chain</summary><p>Less supplier capacity narrows purchasing options. Fewer complete component sets limit production. Lower production reduces the demand that can be served. This is aggregate model behavior, not a diagnosis of a named supplier.</p></details>
    </section>`;
  }
  return `<section class="vc-worked-example" id="findings" aria-labelledby="findings-title"><p class="vc-kicker">Synthetic example · COM-0054</p><h2 id="findings-title">One commitment. Three different records.</h2><p class="vc-example-intro">These quantities describe different planning states. They are not interchangeable.</p><dl class="vc-records">${chain.records.map(record => `<div><dt>${esc(record.label)}</dt><dd><strong>${esc(record.value)}</strong><span>${esc(record.note)}</span></dd></div>`).join('')}</dl>
    <div class="vc-findings"><p class="vc-kicker">Follow this commitment</p>${chain.findings.map((finding, index) => `<button type="button" data-vc-jump="${finding.stage}"><span class="vc-finding-number" aria-hidden="true">${index + 1}</span><span><strong>${esc(finding.label)}</strong><span>${esc(finding.text)}</span></span><span aria-hidden="true">↗</span></button>`).join('')}</div>
    <details class="vc-evidence"><summary>What comes after review?</summary><p>Human review → authorized system change → outcome tracking.</p><p>This is a proposed next step, not part of the read-only prototype. An explanation does not approve a commitment or update an operating system.</p></details></section>`;
}
