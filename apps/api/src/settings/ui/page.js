const $ = (id) => document.getElementById(id);
const base = '/api/v1/admin/settings';
let csrf = '',
  etag = '',
  state,
  changes = {},
  busy = false,
  applying = false;
const effectNames = {
  live: '直接读取',
  restart: '受控重启后生效',
  deployment: '部署后生效',
  release: '前后端同步发版',
};
const message = (text, error = false) => {
  $('message').textContent = text;
  $('message').className = error ? 'error' : '';
};
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
async function request(url, method = 'GET', body) {
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(method === 'GET' ? {} : { 'X-CSRF-Token': csrf, 'If-Match': etag }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(new Error(data.reason || `HTTP ${response.status}`), {
      status: response.status,
      fields: data.fields,
    });
  const next = response.headers.get('etag');
  if (next) etag = next;
  return data;
}
function dirty() {
  const count = Object.keys(changes).length;
  $('dirty').textContent = count ? `${count} 项未保存修改` : '没有未保存修改';
  $('save').disabled = busy || applying || !count || !state?.writable;
  $('reload').disabled = applying || busy;
  $('discard').disabled = applying || busy;
  for (const input of document.querySelectorAll(
    '#settings input,#settings textarea,#settings select,.audit button,.secret-tools button',
  ))
    input.disabled = applying || busy || !state?.writable;
  const pending = state?.items.some(
    (item) => item.pending && ['restart', 'deployment'].includes(item.effect),
  );
  $('apply').disabled =
    busy ||
    applying ||
    !!count ||
    !pending ||
    !state?.controller.connected ||
    state?.controller.phase === 'applying';
}
function controllerStatus(status) {
  const labels = {
    idle: '已就绪',
    applying: '应用中',
    applied: '应用成功',
    failed: '上次应用失败',
    offline: '未连接',
  };
  $('controller').textContent = status?.connected
    ? `${labels[status.phase] || '等待应用'} · ${status.message || ''}`
    : '应用器未连接。配置可以保存；恢复连接后才能应用重启与部署设置。';
}
function change(item, value) {
  if (item.type !== 'secret' && JSON.stringify(value) === JSON.stringify(item.value))
    delete changes[item.key];
  else changes[item.key] = value;
  dirty();
}
function render() {
  $('login').hidden = true;
  $('workspace').hidden = false;
  $('revision').textContent = `配置版本 ${state.revision}`;
  $('path').textContent = state.file;
  controllerStatus(state.controller);
  $('pending').textContent =
    `${state.items.filter((item) => item.pending).length} 项等待重启、部署或同步发版`;
  $('groups').replaceChildren();
  const groups = new Map();
  for (const item of state.items) {
    if (!groups.has(item.group)) {
      const advanced = item.effect === 'release';
      const section = element(advanced ? 'details' : 'section', undefined, 'group');
      section.append(element(advanced ? 'summary' : 'h2', item.group));
      $('groups').append(section);
      groups.set(item.group, section);
    }
    const row = element('div', undefined, 'row');
    row.dataset.search = `${item.key} ${item.label} ${item.description}`.toLowerCase();
    row.dataset.effect = item.effect;
    const description = element('div');
    const name = element('label', undefined, 'name');
    name.htmlFor = `field-${item.key}`;
    name.append(
      document.createTextNode(item.label),
      element('span', effectNames[item.effect], 'badge'),
    );
    if (item.pending) name.append(element('span', '待应用', 'badge pending'));
    description.append(name, element('p', item.key, 'key'));
    if (item.description) description.append(element('p', item.description, 'description'));
    const field = element('div');
    let input;
    if (item.options) {
      input = element('select');
      for (const option of item.options) {
        const node = element('option', option || '关闭／留空');
        node.value = option;
        input.append(node);
      }
    } else if (item.type === 'json') {
      input = element('textarea');
      input.rows = 10;
    } else {
      input = element('input');
      input.type = item.type === 'number' ? 'number' : item.type === 'secret' ? 'password' : 'text';
      if (item.type === 'number') {
        input.min = item.min;
        input.max = item.max;
        input.step = item.integer ? '1' : 'any';
      }
    }
    input.id = `field-${item.key}`;
    input.name = item.key;
    input.autocomplete = item.type === 'secret' ? 'new-password' : 'off';
    if (item.type === 'secret')
      input.placeholder = item.configured ? '已配置；留空不修改' : '未配置；输入新值';
    else input.value = Object.hasOwn(changes, item.key) ? (changes[item.key] ?? '') : item.value;
    input.disabled = !state.writable;
    input.addEventListener('input', () => {
      const value =
        item.type === 'number' ? (input.value === '' ? '' : Number(input.value)) : input.value;
      if (item.type === 'secret' && !value) delete changes[item.key];
      else change(item, value);
      dirty();
    });
    field.append(input);
    const hint =
      item.type === 'secret'
        ? `密钥只写入，不回显；当前${item.configured ? '已配置' : '未配置'}`
        : `来源：${{ file: '配置文件', environment: '启动环境', default: '源码默认值' }[item.source]}${item.pending ? `；当前生效：${item.effective}` : ''}${item.type === 'number' ? `；范围 ${item.min}～${item.max}` : ''}`;
    field.append(element('p', hint, 'hint'));
    const tools = element('div', undefined, 'secret-tools');
    if (item.type === 'secret') {
      const clear = element('button', '清除密钥', 'secondary');
      clear.type = 'button';
      clear.addEventListener('click', () => {
        if (confirm(`清除“${item.label}”？相关功能可能不可用。`)) {
          changes[item.key] = '';
          input.value = '';
          input.placeholder = '将清除，等待保存';
          dirty();
        }
      });
      tools.append(clear);
    }
    const reset = element('button', '恢复启动默认值', 'secondary');
    reset.type = 'button';
    reset.addEventListener('click', () => {
      changes[item.key] = null;
      input.value = item.type === 'secret' ? '' : item.inherited;
      if (item.type === 'secret') input.placeholder = '保存后使用启动配置中的密钥';
      dirty();
    });
    tools.append(reset);
    field.append(tools);
    const error = element('div', '', 'field-error');
    error.id = `error-${item.key}`;
    field.append(error);
    row.append(description, field);
    groups.get(item.group).append(row);
  }
  $('history').replaceChildren();
  const history = [...state.audit].reverse();
  if (state.revision > 0) history.push({ revision: 0, at: null, keys: [], actor: '初始启动配置' });
  for (const entry of history) {
    const row = element('div', undefined, 'audit');
    row.append(
      element(
        'span',
        `版本 ${entry.revision} · ${entry.at ? new Date(entry.at).toLocaleString() : '初始状态'} · ${entry.keys.length} 项 · 操作人 ${entry.actor}`,
      ),
    );
    if (entry.revision < state.revision) {
      const button = element('button', '恢复至该版本', 'secondary');
      button.type = 'button';
      button.addEventListener('click', async () => {
        if (Object.keys(changes).length) return message('请先保存或放弃当前修改。', true);
        if (!confirm(`恢复到版本 ${entry.revision}？会生成新版本，需要重启／部署的参数仍需应用。`))
          return;
        busy = true;
        dirty();
        try {
          state = await request(`${base}/restore`, 'POST', { revision: entry.revision });
          render();
          message('已恢复配置，生效状态见各项标记。');
        } catch (error) {
          failure(error);
        } finally {
          busy = false;
          dirty();
        }
      });
      row.append(button);
    }
    $('history').append(row);
  }
  dirty();
  filter();
  if (state.problem) message(state.problem, true);
}
function failure(error) {
  if (error.status === 401 || (error.status === 403 && !state)) {
    $('login').hidden = false;
    $('workspace').hidden = true;
  }
  if (error.status === 412)
    return message(
      '配置已被其他管理员修改。你的修改仍保留；请复制需要保留的内容后重新读取。',
      true,
    );
  for (const [key, text] of Object.entries(error.fields || {})) {
    const node = $(`error-${key}`);
    if (node) node.textContent = text;
  }
  message(
    error.status === 403
      ? '需要有效管理员账号；同时请确认当前页面来源与正式网站地址一致。'
      : error.status === 503
        ? '配置服务暂不可用；本次修改未确认保存，请保留输入。'
        : '操作失败，请检查输入和连接。',
    true,
  );
}
async function load() {
  const previous = busy;
  busy = true;
  dirty();
  try {
    state = await request(base);
    changes = {};
    render();
  } finally {
    busy = previous;
    dirty();
  }
}
function filter() {
  const term = $('search').value.trim().toLowerCase(),
    effect = $('effect').value;
  for (const row of document.querySelectorAll('.row'))
    row.hidden =
      !row.dataset.search.includes(term) || (effect !== 'all' && row.dataset.effect !== effect);
  for (const group of document.querySelectorAll('.group')) {
    group.hidden = ![...group.querySelectorAll('.row')].some((row) => !row.hidden);
    if (group.tagName === 'DETAILS' && (term || effect === 'release')) group.open = !group.hidden;
  }
}
$('search').addEventListener('input', filter);
$('effect').addEventListener('change', filter);
$('reload').addEventListener('click', async () => {
  if (Object.keys(changes).length && !confirm('重新读取会放弃未保存修改，继续吗？')) return;
  try {
    await load();
    message('已重新读取服务器配置。');
  } catch (error) {
    failure(error);
  }
});
$('discard').addEventListener('click', () => {
  changes = {};
  render();
});
$('apply').addEventListener('click', async () => {
  if (applying || busy || Object.keys(changes).length) return;
  if (
    !confirm(
      '应用当前已保存的重启与部署设置？万物声谱可能短暂中断。应用器会检查资源和任务；外部域名、存储目标及数据库目标切换须另行完成迁移。',
    )
  )
    return;
  applying = true;
  dirty();
  try {
    const job = await request(`${base}/apply`, 'POST', {});
    message('已提交应用请求，正在等待检查与执行。请保持页面打开。');
    const deadline = Date.now() + 12 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      let status;
      try {
        status = await request(`${base}/apply-status`);
      } catch (error) {
        if (error.status === 401) {
          message('服务已重新启动，请重新登录管理员账号查看当前生效值。', true);
          failure(error);
          return;
        }
        continue;
      }
      state.controller = status;
      controllerStatus(status);
      if (status.requestId === job.id && ['applied', 'failed'].includes(status.phase)) {
        await load();
        message(status.message, status.phase === 'failed');
        return;
      }
    }
    message('尚未取得最终结果。请稍后重新读取并核对生效值，不要重复提交。', true);
  } catch (error) {
    failure(error);
  } finally {
    applying = false;
    dirty();
  }
});
$('login').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  try {
    const result = await request(`${base}/login`, 'POST', {
      username: data.get('username'),
      password: data.get('password'),
    });
    csrf = result.csrfToken;
    form.reset();
    await load();
    message('已登录管理员配置页。');
  } catch (error) {
    failure(error);
  }
});
$('settings').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  dirty();
  for (const node of document.querySelectorAll('.field-error')) node.textContent = '';
  try {
    state = await request(base, 'PATCH', { changes });
    changes = {};
    render();
    message('配置文件已保存。直接读取项已更新；其余项目请查看待应用标记。');
  } catch (error) {
    failure(error);
  } finally {
    busy = false;
    dirty();
  }
});
window.addEventListener('beforeunload', (event) => {
  if (Object.keys(changes).length) {
    event.preventDefault();
    event.returnValue = '';
  }
});
try {
  csrf = (await request(`${base}/csrf`)).csrfToken;
  await load();
} catch (error) {
  if (error.status === 401) $('login').hidden = false;
  else failure(error);
}
