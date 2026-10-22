import { ghs, loadStore } from './ui.js';

const store = await loadStore();
const table = document.querySelector('[data-fees]');
table.innerHTML = store.deliveryFees.map((fee) => `
  <tr>
    <td>${fee.region}</td>
    <td>${ghs(fee.standardFee)}<br><span class="muted">${fee.standardDays}</span></td>
    <td>${ghs(fee.expressFee)}<br><span class="muted">${fee.expressDays}</span></td>
  </tr>`).join('');
const note = document.querySelector('[data-store-email]');
if (note) note.textContent = store.email;
