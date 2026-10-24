
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

  // Move status information into the popout too.
  for (const id of ['message', 'people']) {
    const item = document.getElementById(id);
    if (item) content.appendChild(item);
  }

  gear.addEventListener('click', () => dialog.showModal());

  dialog.querySelector('#close-settings')
    .addEventListener('click', () => dialog.close());

  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener('close', () => gear.focus());

  // Automatically detect the user's local time zone.
  function showLocalZone() {
    const zone = new Intl.DateTimeFormat('en-US', {
      timeZoneName: 'long'
    }).formatToParts(new Date())
      .find(part => part.type === 'timeZoneName')?.value
      || 'Local time';

    schedule.textContent =
      `Focus :00–:50 · Break :50–:00 · ${zone}`;
  }

  showLocalZone();
  window.addEventListener('pageshow', showLocalZone);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) showLocalZone();
  });
})();
