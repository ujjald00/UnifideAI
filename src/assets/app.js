const menuButton = document.querySelector('.menu-button');
const mobileMenu = document.querySelector('#mobile-menu');

menuButton?.addEventListener('click', () => {
  const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!isOpen));
  menuButton.setAttribute('aria-label', isOpen ? 'Open navigation' : 'Close navigation');
  mobileMenu.hidden = isOpen;
});

mobileMenu?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    menuButton.setAttribute('aria-expanded', 'false');
    mobileMenu.hidden = true;
  });
});

document.querySelectorAll('.mobile-group > button').forEach((button) => {
  button.addEventListener('click', () => {
    const willOpen = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(willOpen));
    document.getElementById(button.getAttribute('aria-controls')).hidden = !willOpen;
  });
});

document.querySelectorAll('[data-dropdown]').forEach((item) => {
  const trigger = item.querySelector('.nav-trigger');
  const links = [...item.querySelectorAll('.dropdown a')];
  const canHover = window.matchMedia('(hover: hover)').matches;
  let closeTimer;
  let openedByHover = false;

  const setOpen = (open) => {
    clearTimeout(closeTimer);
    if (open) {
      document.querySelectorAll('[data-dropdown].is-open').forEach((other) => {
        if (other === item) return;
        other.classList.remove('is-open');
        other.querySelector('.nav-trigger')?.setAttribute('aria-expanded', 'false');
      });
    }
    if (!open) openedByHover = false;
    item.classList.toggle('is-open', open);
    trigger.setAttribute('aria-expanded', String(open));
  };

  trigger.addEventListener('click', () => {
    const isOpen = trigger.getAttribute('aria-expanded') === 'true';
    setOpen(!isOpen || openedByHover);
    openedByHover = false;
  });
  trigger.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
    links[0].focus();
  });
  item.addEventListener('keydown', (event) => {
    const index = links.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      setOpen(false);
      trigger.focus();
    } else if (index > -1 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      links[(index + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length].focus();
    }
  });
  item.addEventListener('focusout', (event) => {
    if (!item.contains(event.relatedTarget)) setOpen(false);
  });
  if (canHover) {
    item.addEventListener('mouseenter', () => {
      if (trigger.getAttribute('aria-expanded') !== 'true') openedByHover = true;
      setOpen(true);
    });
    item.addEventListener('mouseleave', () => { closeTimer = setTimeout(() => setOpen(false), 150); });
  }
  document.addEventListener('click', (event) => {
    if (!item.contains(event.target)) setOpen(false);
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
