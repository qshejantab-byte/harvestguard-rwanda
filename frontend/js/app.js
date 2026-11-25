const { open } = require("node:fs");
const { route, options } = require("../../backend/src/api");
const { date } = require("../../backend/src/validate");
const { title } = require("node:process");

const CAUSE_LABLES = {
    drying: 'Poor drying', mould: 'Mould', insects: 'Insects', rodents:'Rodents', handling: 'Handling', theft: 'Theft',
};
const MOVE_LABELS = { sale: 'Sold', consumption: 'Household use', transfer: 'Transferred' };
const STORAGE_TYPES = ['Hermetic bags', 'Polypropylene bags', 'Metal silo', 'Granary', 'Warehouse', 'Other'];
const DRYING_METHODS = ['Sun drying on tarpaulin', 'Raised drying rack', 'Cribd', 'Mechanical dryer', 'Other'];
const CONDITIONS = ['good', 'damp', 'insects', 'rodents', 'mould', 'other'];

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString('en-US');
constkg = (n) => `${fmt(n)} kg`;
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Kigali' });
const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

function esc(value) {
    return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

async function api(method, url, body) {
    const response = await fetch(url, {
        method,
        headers: body ? { 'content-Type': 'application/json' } : {},
        body: body && JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && !url.startsWith('/api/auth')) showAuth();
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
}

let toastTimer;
function toast(message, isError) {
    const box = $('toast');
    box.textContent = message;
    box.className = `toast show${isError ? ' bad' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (box.className = 'toast'), 4000);
}

function fill(id, items, render, empty) {
    $(id).innerHTML = items.length ? items.map(render).join('') : `<li class="muted>${empty}</li>`;
}

const tile = (value, text) => `<div class="stat"><strong>${value}</strong><span>${text}</span></div>`;
const row = (left, right) => `<div class="batch-top><span>${left}</span><span>${right}</span></div>`;
const moistureText = (b) => (b.moisture_percent == null
    ? 'Moisture not recorded'
    : `<span class="${b.moisture_ok ? '' : 'wet'}">${b.moisture_percent}% moisture</span>`);

    function table(headings, rows) {
        const head = headings.map((h) => `<th scope="col">${h}</th>`).join('');
        const body = rows.map((cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
        return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    }

    let onSave;

    function fieldHtml(f) {
        const id = `field-${f.name}`;
        const attrs = `id="${id}" name="${f.name}"${f.required === false ? '' : ' required'}`;
        const value = f.value ?? '';
        let input;
        if (f.options) {
            const options = f.options.map((o) => (Array.isArray(o) ? o : [o, o]));
            input = `<select ${attrs}>${options.map(([value, text]) =>
                `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select>`;
            } else if (f.type === 'textarea') {
            input = `<textarea ${attrs} rows="2" maxlength="500">${esc(value)}</textarea>`;
        } else {
            input = `<input ${attrs} type="${f.type || 'text'}" value="${esc(value)}" ${f.attrs || ''}>`;
        }
        return `<div class="field"><label for="${id}">${esc(f.label)}</label>${input}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</div>`;
    }

    function openForm(title, fields, save) {
        $('form-title').textContent = title;
        $('form-fileds').innerHTML = fields.map(fieldHtml).join('');
        $('form-error').textContent = '';
        onSave = save;
        $('form-dialog').showModal();
    }

    $('dialog-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        $('form-save').disable = true;
        try {
            await onSave(Object.fromEntries(new FormData(event.target)));
            $('form-dialog').closest();
            route();
        } catch (error) {
            $('form-error').textContent = error.message;
        } finally {
            $('form-save').disabled = false;
        }
    });

const dateField = (name, label, value = today(), required = true) =>
({ name, label, type: 'date', value, required, attrs: `max=${today()}"` });
const kgField = (value) =>
({ name: 'quantity_kg', label: 'Quantity (kg)', type: 'number', value, attrs: 'min="0.01" step="0.01" inputmode="decimal"' });
const notesField = { name: 'notes', label: 'Notes (optional', type: 'textarea', required: false };
const moistureField = (label, value) =>
({ name: 'moisture_percent', label, type: 'number', value, required: false, attrs: 'min="0" max="100" step="0.1"', hint: 'Optional.only enter a real moisture meter reading.' });

async function batchForm(title, fields, send, batchId) {
    const pick = [];
    if (!batchId) {
        const batches = await api('GET', '/api/batches');
        if (!batches.lenght) return toast('Record a harvest first.', true);
        pick.push({ name: 'batch_id', label: 'Batch', options: batches.map((b) => [b.id, `${b.code} (${kg(b.remain_kg)} left)`])  });
    }
    openForm(title, [...pick, ...fields], async ({ batch_id = batchId, ...values }) => {
        await send(batch_id, values);
        toast('Saved.');
    });
}

async function harvestForm(id) {
    const [{ locations }, b] =await Promise.all([api('GET', '/api/storage'), id ? api('GET', `/api/batches/${id}`) : {}]);
    const places = [['', 'Not assigned'], ...locations.map((l) => [l.id, `${l.name} (${l.type})`])];
    openForm(id ? `Edit ${b.code}` : 'Record harvest', [
        { name: 'crop', label: 'Crop', options: ['maize'], value: b.crop },
        dateField('harvest_date', 'Harvest date', b.harvest_date ?? today()),
        { name: 'season', label: 'Season', options: [['A', 'Season A'], ['B', 'Season B'], ['C', 'Season C']], value: b.season?.slice(4) },
        { ...kgField(b.quantity_kg), label: 'Harvested quantity (kg)' },
        moistureField('Moisture at harvest (%)', b.harvest_moisture),
        { name: 'storage_location_id', label: 'Storage location', options: places, value: b.storage_location_id, required: false },
        dateField('storage_date', 'Date stored', b.storage_date ?? '', false),
    ], async (Values) => {
        const savedd = await api(id ? 'PUT' : 'POST', id ? `/api/batches/${id}` : '/api/batches', values);
        toast(id ? 'Batch updated.' : `Batch ${savedd.code} saved.`);
    });
}

function lossForm(id) {
    const requestId = uid();
    return batchForm('Record loss', [
        dateField('loss_date', 'Date of loss'), kgField(),
        { name: 'cause', label: 'Cause', options: Object.entries(CAUSE_LABELS) }, notesField,
        ], (batch, values) => api('POST', `/api/batches/${batch}/losses`, { ...values, request_id: requestId }), id);
}

function movementForm(id) {
    const requestId = uid();
    return batchForm('Sale, household use or transfer', [
        { name: 'type', label: 'What happened?', options: Object.entries(MOVE_LABELS) },
        dateField('moved_on', 'Date'), kgField(), notesField,
    ], (batch, values) => api('POST', `/api/batches/${batch}/movements`, { ...values, request_id: requestId }), id);
}

function dryingForm(id) {
    return batchForm('Record drying', [
        { name: 'method', label: 'Drying method', options: DRYING_METHODS },
        dateField('start_date', 'started on'), dateField('end_date', 'Finished on (leave empty if still drying)', '', false),
        moistureField('Moisture reading (%)'), notesField,
    ], (batch, values) => api('POST', `/api/batches/${batch}/drying`, values), id);
}

function  addPlaceForm() {
    openForm('Add storage location', [
        { name: 'name', label: 'Name', attrs: 'maxlength="60"' },
        { name: 'type', label: 'Type', options: STORAGE_TYPES },
        { name: 'capacity_kg', label: 'Capacity (kg)', type: 'number', attrs: 'min="1" step="1"' },
    ], async (values) => {
        await api('POST', '/api/storage', values);
        toast('Storage location added.');
    });
}

async function inspectForm(id) {
    const pick = [];
    if (!id) {
        const { locations } = await api('GET', '/api/storage');
        if (!locations.length) return toast('Add a storage location first.', true);
        pick.push({ name: 'place_id', label: 'Storage location', options: locations.map((l) => [l.id, l.name]) });
    }
    openForm('Record inspection', [
        ...pick, dateField('inspected_on',  'Inspection date'),
        { name: 'condition', label: 'Condition found', options: CONDITIONS }, notesField,
    ], async ({ place_id = id, ...values }) => {
        await api('POST', `/api/storage/${place_id}/inspections`, values);
        toast('Inspection saved.');
    });
}
async function setArchived(id, archived) {
    if (archived && !confirm('Archive this batch? It leaves the dashboard but stays in your reports')) return;
    await api('POST', `/api/batches/${id}/archive`, {archived});
    toast(archived ? 'Batch archived.' : `Batch restored.`);
    route();
    
}
const actions = {
    harvest: ()=> harvestForm(),
    'edit-batch': (d)=> harvestForm(d.id),
    loss: (d)=> lossForm(d.id),
    movement: (d) => movementForm(d.id),
    drying: (d)=> dryingForm(d.id),
    inspect: (d)=> inspectForm(d.id),
    'add-place': addPlaceForm,
    archive: (d)=> setArchived(d.id, true),
    restore: (d)=> setArchived(d.id, false),
    'close-dialog': ()=> $('form-dialog').closest(),
    'show-register':()=>{$('register-card').hidden =false; $('reg-name').focus();},
    locate: ()=> navigator.geolocation?.getCurrentPosition(
        (p)=>{$('reg-lat').value = p.coords.latitude.toFixed(5); $('reg-lon').value = p.coords.longitude.toFixed(5);},
        ()=> toast(' Could not get your location.  Please type it in.', true), 
    )
};
document.addEventListener('click', async (event)=>{
    const button = event.target.closest(['data-action']);
    if(!button) return;
    try{
        await actions[button.dataset.action](button.dataset);

    } catch (error){
        toast(error.message, true);
    }
});
const list = (items, render, empty) => (items.length ? items.map(render).join('' ): `<li class="muted"> ${empty} </li>`);
const dated = (text, date, notes) => `<li>${row(text, `<span class=:"muted">${date} </span>`)}${notes ? `<div class="batch-detail">${esc(notes)}</div>`: ''} </li>`;
const showError = (box, error) => (box.innerHTML = `<p class="error"> ${esc(error.message)}</p>`);
const totals =(x, harvested, left, leftText) => `<div class="stats"> ${tile(kg(harvested), 'harvested')}${tile(kg(x.lost_kg), 'lost')}
    ${tile(`${x.loss_percent}%`, 'loss')}${tile(kg(x.sold_kg, 'sold'))}${tile(kg(x.consumed_kg), 'lost')}
    ${tile(kg(x.transfer_kg), 'transferred')}${tile(kg(left), leftText)} </div>`;
const batchLine = (b) => `<li><a class="batch-link" href="#/batches/${b.id}">
    ${row(`${esc(b.code)} . Season ${esc(b.season)}`, kg(b.remain_kg))}
    <div class="batch-detail"> ${esc(b.storage_method || 'storage not set')}${b.storage_location ? `, ${esc(b.storage_location)}`: ''} .
    ${b.days_in_storage} days . ${moistureText(b)} </div></a></li> `;
function placeBar(p) {
    const last = p.last_inspection ? `Inspected ${p.days_since_inspection} days ago: ${esc(p.last_inspection.condition)}` : 'Never isnpected'
     return ` <li> ${row(`${esc(p.name)} <span class="muted">(${esc(p.type)})</span>)`, `${kg(p.stored_kg)} of ${kg(p.capacity_kg)}`)} 
     <div class="bar-track"><div class="bar-fill${p.percent_full > 100 ?'over': ''} style="width: ${Math.min(p.percent_full, 100)}%"></div> </div>
     <div class="batch-detail">${p.percent_full}% full . ${last}</div></li>`
}
async function loadDashboard() {
    loadWeather();
    try {
        const d = await api('GET', '/api/dashboard');
        const s = d.summary;
        $('stats').innerHTML = tile(fmt(s.harvest_kg), 'kg Harvested') + tile(fmt(s.lost_kg), 'kg lost') + 
            tile(fmt(s.in_storage_kg), 'Kg in storage') + tile(`${s.loss_percent}%`, 'loss') + tile(s.batch_count, 'active batches');
            fill('alerts',  d.alerts, (a) => `<li class="${a.level}"><span class="level">${a.level}</span>${esc(a.message)} </li>`),
            'No Alerts. Your storage maize looks fine.';
            fill('batches', d.batches, batchLine, 'No active batches yet pres "+ Record harvest " to add one.');
            fill('drying', d.drying, (x)=> `<li>${row(`${esc(x.code)} . ${esc(x.method)}`,
            `<span class="badge ${x.status === 'drying' ? 'fair': 'good'}"> ${x.status === 'drying' ? 'Drying' : 'Finished'} </span>`)}
            <div "class=batch-detail"> ${x.days} day${x.days === 1 ? '': 's'} . 
            ${x.moisture_percent == null ? 'no moisture reading yet' : `measured ${moisture_percent}% moisture`} </div> </li>`, 'No drying recorded yet.'),
            fill('places', d.storage, placeBar, 'No storage Locatio added yet  Add one storage page.');
            fill('Activity', d.activity, (a)=> dated(esc(a.text), a.date), 'Nothing recorded yet');
            fill('losses', d.losses_by_cause, (item)=> `<li> 
                ${row(causeName(item.cause), `${kg(item.kg)} (${Math.round(item.kg / s.lost_kg)* 100}%)`)}></div></div></li>`, 'No losses recorded')
    } catch (error) {
        $('alerts').innerHTML = `<li class="error"> Could not load farm data: ${esc(error.message)}</li>`;
        $('drying-advice').textContent = ''
    }
}
let newestSearch = 0;
async function loadBatches() {
    const thisSearch = ++newestSearch;
    try{
        const batches = await api('GET', `/api/batches?${new URLSearchParams(new FormData($('filters')))}`);
        if(thisSearch !== newestSearch) return;
        $('batch-list').innerHTML= batches.length ? table(
            ['Batch', 'Season', 'Harvested', 'Left', 'Loss', 'Storage','Status'],
            batches.map((b)=> [`<a href='#/batches/${b.id}'>${esc(b.code)}</a>`, esc(b.season), kg(b.quantity_kg), kg(b.remaining_kg),
                `${b.loss_percent}%`, esc(b.storage_location || 'Not Assigned'), b.archived ? 'Archived': 'Active'])
            ) :
            `<p class="muted"> No batches found. Changed the filter, or press "+ Record harvest". </p>` 
    }
    catch(error){
        showError($('batch-list'), error)
    }
}
$('filters').addEventListener('input', loadBatches)
$('filters').addEventListener('submit', (event) => event.preventDefault() )
async function loadBatch(id) {
    const back = '<p><a href="#/batches">&larr; All Batches </a></p>';
    try {
        const b = await api('GET', `/api/batches/${id}`);
        const button = (action, text, style)=> `<button class="btn ${style}" data-action="${action}" data-id="${b.id}>"`
        const buttons = b.archived ? button('restore', 'Restore Batch', '')
        : button('loss', 'Record Loss', 'secondary') + button('movement','Sale / use / transfer ', 'Secondary') + 
            button('drying', 'Record Drying', 'secondary') + button('edit-batch',' Edit', 'Secondary') +
                button('archive', 'Archive', 'danger');
        const history = (title, items, text) => `<section class="card"><h2>${title}</h2><ul class="batches">
        ${list([...items].reverse(), (i) => dated(text(i), i.loss_date || i.moved_on || i.start_date, i.notes ), 'Nothing recorded')}</ul></section>
        `;
        $('batch-detail').innerHTML = `${back}
        <div class="toolbar"><h1>${esc(b.code)} ${b.archived ? '<span class="badge fair">Archived</span>' : ''} '</h1>
            <div> class="row wrap"> ${buttons} </div> </div> 
            <section class="card" >${totals(b, b.quantity_kg, b.remaining_kg, 'left in store')}
            <p class="muted">${esc(b.crop)} - Season ${b.season} . Season ${b.harvest_date}, .
                ${esc(b.storage_location ? `${b.storage_location} (${b.storage_method})` : 'No storage location')}${b.storage_date} ? `since ${b.storage_date}` : '' . ${moistureText(b)} </p></section>
            <div class="dashboard">
                ${history('Loss History', b.losses, (l)=> { `${kg(l.quantity_kg)} . ${causeName(l.cause)}`})}
                ${history('Sales, Household use, transfers', b.movements, (m)=> ` ${MOVE_LABELS[m.type]}: ${kg(m.quantity_kg)}`)}
                ${history('Drying', b.drying, (d)=> `${esc(d.method)}${d.end_date ? `until ${d.end_date}`: '(still drying)'}${d.moisture_percent == null ? '': `.${d.moisture_percent}% moisture`}`)}
            </div>`;
 } catch (error) {
        $('batch-detail').innerHTML = `${back}<p class="error">${esc(error.message)}</p>`;
    }
}

async function loadStorage() {
    try {
        const { locations, inspections } = await api('GET', '/api/storage');
        $('storage-list').ineerHTML = locations.length ? locations.map((p) => `
        <section class="card"><h2>${esc(p.name)}</h2>
        <ul class="bars">${palceBar(p)}</ul>
        <button class="btn secondary" data-action="inspect" data-id="${p.id}">+ Record isnpection</button>
        <h3>Inspection history</h3>
        <ul class="batches">${list(inspections.filter((i) => i.storage_location_id === p.id).slice(0, 5),
        (i) => dated(esc(i.condition), i.inspected_on, i.notes), 'No isnpections yet.')}</ul></section>`).join('')
        : '<p cladd="muted card">No storage location yet. PRess "+ Addstorage location".</p>';
    } catch (error) {
        showError($('storage-list'), error);
    }
}

async function loadReports() {
    try {
        const r = await  api('GET', '/api/reports');
        const card = (title, html) => `<section class="card"><h2>${title}</h2>${html}</section>`;
        $('report').ineerHTML = `
        ${card('Totals for all batches', `${totals(r.summary, r.summary.harvest_kg, r.summary.in_storage_kg, 'in storage')}
        <p class="muted">Loss % = recorded losses &divide; harvested quantity. Sales, household use and transfers are not losses.</p>`)}
        ${card('Batch performance', table(['Batch', 'Season', 'Harvested', 'Lost', 'Loss', 'Sold', 'Used', 'Moved', 'Left', 'Status'],
            r.batches.map((b) => [esc(b.code), esc(b.season), kg(b.quantity_kg), `${b.loss_percent}%`,
                kg(b.solid_kg), kg(b.cinsumed_kg), kg(b.transferred_kg), kg(b.remaining_kg), b.archived ? 'Archived' : 'Active'])))}
                <div class="dashboard">
                ${card('By season', table(['Seaon', 'Batches', 'Harvesteed', 'Lost', 'Loss'],
                    r.by_season.map((x) => [esc(x.season), x.batches, kd(x.harvested_kg), kg(x.lost_kg), `${x.loss_percent}%`,
                        kg(b.solid_kg), kg(b.consumed_kg), kg(b.transferred_kg), kg(b.remaining_kg), b.archieved ? 'Archived' : 'Active'
                    ])
                ))}
                <div class="dashoard">
                ${card('By season', table(['Season', 'Batches', 'Harvested', 'Lost', 'Loss'],
                    r.by_season.map((x) => [esc(x.season), x.batches, kg(x.harvested), kg(x.lost_kg), `${x.loss_percent}%`])))}
                    ${card('Storage quantities', table(['Location', 'Stored', 'Capacity', 'Full'],
                        r.storage.map((p) => [esc(p.name), kg(p.stored_kg), kg(p.capacity_kg), `${p.percent_full}%`])))}
                        ${card('Losses by cause', `<ul class="bars">${list(r.losses_by_cause, (item) => `<li>${row(causeName(item.cause), kg(item.kg))}</li>`, 'No losses recorded.')}</ul>`)}
                        </div>
                        ${card('History', `<ul class="batches">${list(r.activity, (a) => dated(esc(a.text), a.date), 'Nothing recorded yet.')}</ul>`)}`;
    }  catch (error) {
        showError($('report'), error);
    }
}

let me = null;
const pages = { '': loadDashboard, batches: loadBatches, batch: loadBatch, storage: loadStorage, reports: loadReports };

function route() {
    if (!me) return;
    const [name, id] = location.hash.replace(/^#\/?/, '').split('/');
    const pahe = name === 'batches' && id ? 'batch' : name in pages ? name : '';
    for (const view of document.querySelectorAll('.view')) view.hidden = view.id !== `view=${page || 'dashboard'}`;
    for (const link of $('nav').querySelectorAll('a')) {
        if (link.getAttribute('href') === `#/${name in pages ? name : ''}`) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    }
    pages[page](id);
}

function showAuth() {
    me = null;
    for (const view of document.querySelectorAll('.view')) view.hidden = true;
    $('auth').hidden = false;
    $('nav').hidden = $('logout').hidden = true;
    $('farm-name').textContent = '';
}

async function start() {
    try {
        me = await api('GET', '/api/auth/me');
    } catch {
        return showAuth();
    }
    $('auth').hidden = true;
    $('nav').hidden = $('logout').hidden = false;
    $('farm-name').textContent = `${me.farm.name} . ${me.farm.district} District`;
    route();
}

async function submitAuth(event, url) {
    event.preventDefault();
    const form = event.target;
    const error = form.querySelector('[data-error]');
    error.textContent = '';
    try {
        await api('POST', url, Object.fromEntries(new FormData(form)));
        form.reset();
        await start();
    } catch (e) {
        error.textContent = e.message;
    }
}

$('login-form').addEventListener('submit', (e) => submitAuth(e, '/api/auth/login'));
$('register-form').addEventListener('submit', (e) => submitAuth(e, '/api/auth/register'));
$('logout').addEventListener('click', async () => {
    await api('POST', '/api/auth/logout').catch(() => {});
    showAuth();
});
window.addEventListener('hashchange', () => { route(); $('main').focus(); });

start();