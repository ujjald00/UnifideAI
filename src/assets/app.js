// Native disclosure keeps the six category links usable without JavaScript.
const mobileMenu = document.querySelector('details.mobile-menu');
const menuButton = mobileMenu?.querySelector('summary');
mobileMenu?.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => { mobileMenu.open = false; });
});
mobileMenu?.addEventListener('keydown', event => {
  if (event.key === 'Escape' && mobileMenu.open) {
    event.preventDefault();
    mobileMenu.open = false;
    menuButton.focus();
  }
});
mobileMenu?.addEventListener('focusout', event => {
  if (event.relatedTarget && !mobileMenu.contains(event.relatedTarget)) mobileMenu.open = false;
});
document.addEventListener('click', event => {
  if (mobileMenu && !mobileMenu.contains(event.target)) mobileMenu.open = false;
});
window.matchMedia('(min-width: 1121px)').addEventListener('change', event => {
  if (event.matches && mobileMenu) mobileMenu.open = false;
});

// Keep native fragment navigation/history, while placing keyboard focus at the section.
document.querySelectorAll('.on-page a, .skip-link').forEach(link => {
  link.addEventListener('click', () => {
    const target = document.getElementById(link.hash.slice(1));
    target?.focus({ preventScroll: true });
  });
});

function arrowNavigate(event, items, activate) {
  const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  let index = items.indexOf(event.currentTarget);
  if (event.key in keys) index = (index + keys[event.key] + items.length) % items.length;
  else if (event.key === 'Home') index = 0;
  else if (event.key === 'End') index = items.length - 1;
  else return;
  event.preventDefault();
  activate(index);
  items[index].focus();
}


// Read-only case-study exploration. These controls select saved content only.
document.querySelectorAll('[data-value-chain]').forEach((explorer) => {
  const buttons = [...explorer.querySelectorAll('[data-vc-stage]')];
  const panels = [...explorer.querySelectorAll('[data-vc-panel]')];
  const article = explorer.closest('article');
  const announcement = explorer.querySelector('[data-vc-announcement]');
  const selectStage = (id, scroll = false) => {
    const target = buttons.find(button => button.dataset.vcStage === id);
    if (!target) return;
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button === target)));
    panels.forEach(panel => { panel.hidden = panel.dataset.vcPanel !== id; });
    const panel = panels.find(panel => panel.dataset.vcPanel === id);
    announcement.textContent = `${target.querySelector('.vc-stage-name').textContent} selected. ${panel.querySelector('h3').textContent}`;
    if (scroll) panel.scrollIntoView({ behavior: 'auto', block: 'start' });
  };
  buttons.forEach(button => {
    button.addEventListener('click', () => selectStage(button.dataset.vcStage, window.matchMedia('(max-width: 760px)').matches));
    button.addEventListener('keydown', event => arrowNavigate(event, buttons, next => selectStage(buttons[next].dataset.vcStage)));
  });
  explorer.querySelector('[data-vc-back]')?.addEventListener('click', () => {
    const selected = buttons.find(button => button.getAttribute('aria-pressed') === 'true');
    selected.scrollIntoView({ behavior: 'auto', block: 'center' });
    selected.focus({ preventScroll: true });
  });
  article.querySelectorAll('[data-vc-jump]').forEach(button => {
    button.addEventListener('click', () => {
      selectStage(button.dataset.vcJump, true);
      const heading = explorer.querySelector(`#vc-question-${button.dataset.vcJump}`);
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    });
  });
  const scenarios = [...article.querySelectorAll('[data-vc-scenario]')];
  const results = [...article.querySelectorAll('[data-vc-scenario-panel]')];
  const selectScenario = index => {
    const selected = scenarios[index];
    if (!selected) return;
    scenarios.forEach(button => button.setAttribute('aria-pressed', String(button === selected)));
    results.forEach(panel => { panel.hidden = panel.dataset.vcScenarioPanel !== selected.dataset.vcScenario; });
    explorer.querySelector('[data-vc-summary="components"]').textContent = `${selected.dataset.vcScenario}% capacity available`;
    explorer.querySelector('[data-vc-summary="outcome"]').textContent = `${selected.dataset.vcServed}% of demand served`;
  };
  scenarios.forEach((button, index) => {
    button.addEventListener('click', () => selectScenario(index));
    button.addEventListener('keydown', event => arrowNavigate(event, scenarios, selectScenario));
  });
});
