
(() => {
  const header = document.querySelector('header');
  const settings = document.querySelector('.settings');
  const schedule = document.getElementById('schedule');

  if (!header || !settings || !schedule) return;

  // Create gear button
  const gear = document.createElement('button');
  gear.id = 'settings-gear';
  gear.type = 'button';
  gear.textContent = '⚙';
  gear.setAttribute('aria-label', 'Open settings');
  gear.title = 'Settings';

  header.insertBefore(
    gear,
    document.getElementById('connection')
  );

  // Create settings popout
  const dialog = document.createElement('dialog');
  dialog.id = 'settings-dialog';
  dialog.setAttribute('aria-labelledby', 'settings-heading');

  dialog.innerHTML = `
    <div class="settings-dialog-top">
      <h2 id="settings-heading">Settings</h2>
      <button type="button" id="close-settings"
        aria-label="Close settings">✕</button>
    </div>
    <div class="settings-dialog-body"></div>
  `;

  document.body.appendChild(dialog);

  const content = dialog.querySelector('.settings-dialog-body');

  // Move everything after the hourly schedule into settings.
  // Existing timer, theme, and sound controls retain their listeners.
  while (schedule.nextSibling) {
    content.appendChild(schedule.nextSibling);
  }


  /* Show participants on the main timer screen only */
  const people = document.getElementById('people');
  const controls = document.querySelector('.timer .controls');
  
  if (people && controls) {
    controls.insertAdjacentElement('afterend', people);
  }
  
  /* Keep ordinary status messages in Settings */
  const message = document.getElementById('message');
  if (message) {
    content.appendChild(message);
  }

  // Scale the compact settings only when a very short Discord viewport
  // would otherwise clip controls. No settings scrollbar is needed.
  function fitSettings() {
    if (!dialog.open) return;
    content.style.zoom = '1';
    // Let layout settle after restoring natural size.
    const available = content.clientHeight;
    const needed = content.scrollHeight;
    if (available > 0 && needed > available + 1) {
      content.style.zoom = String(Math.max(0.6, Math.min(1, available / needed)));
    }
  }

  gear.addEventListener('click', () => {
    dialog.showModal();
    requestAnimationFrame(fitSettings);
  });
  window.addEventListener('resize', () => {
    if (dialog.open) requestAnimationFrame(fitSettings);
  });

  dialog.querySelector('#close-settings')
    .addEventListener('click', () => dialog.close());

  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener('close', () => gear.focus());

  // The timer renderer owns the active schedule description.
})();
