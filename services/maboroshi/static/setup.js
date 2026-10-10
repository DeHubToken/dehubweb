'use strict';
let setupToken = location.hash.slice(1);
history.replaceState(null, '', location.pathname);
document.getElementById('setup').onsubmit = async (event) => {
  event.preventDefault();
  const button = event.target.querySelector('button'); button.disabled = true;
  const status = document.getElementById('status');
  try {
    const response = await fetch('configure', { method: 'POST', headers: { 'x-setup-token': setupToken }, body: new FormData(event.target) });
    const data = await response.json();
    if (!response.ok) throw Error(data.detail || 'Connection could not be saved.');
    event.target.reset(); event.target.hidden = true; setupToken = '';
    status.textContent = 'Provider connections saved. The setup link is now disabled. Maboroshi is ready for a paid workflow test.';
  } catch (error) { status.textContent = error.message; button.disabled = false; }
};
