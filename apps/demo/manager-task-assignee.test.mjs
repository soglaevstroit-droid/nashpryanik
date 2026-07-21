import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('./public/styles.css', import.meta.url), 'utf8');

function sourceOf(name) {
  const source = app.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n}`))?.[0];
  assert.ok(source, `${name} source is available`);
  return source;
}

function createAssigneeRenderer(manager) {
  const source = `${sourceOf('taskAssigneeDisplayName')}\n${sourceOf('renderTaskAssignee')}`;
  return new Function(
    'isManager',
    'escapeHtml',
    `${source}; return renderTaskAssignee;`,
  )(
    () => manager,
    (value) => String(value),
  );
}

test('manager card displays the assignee name and never exposes the internal id', () => {
  const render = createAssigneeRenderer(true);
  const output = render({ assignee: { id: 'internal-worker-id', name: 'Илья Н.', email: 'ilya' } });
  assert.match(output, />Ответственный: Илья Н\.</);
  assert.doesNotMatch(output, /internal-worker-id/);
  assert.doesNotMatch(output, /is-unassigned/);
});

test('manager card uses a safe name fallback and handles an empty name', () => {
  const render = createAssigneeRenderer(true);
  assert.match(render({ assignee: { name: '  ', email: 'worker@example.test' } }), /worker@example\.test/);
  assert.doesNotMatch(render({ assignee: { name: '  ', email: 'worker@example.test' } }), /undefined|null/);
  assert.match(render({ assignee: null }), />Ответственный не назначен</);
  assert.match(render({ assignee: null }), /taskAssignee is-unassigned/);
});

test('worker task cards do not receive the assignee row', () => {
  const render = createAssigneeRenderer(false);
  assert.equal(render({ assignee: { name: 'Другой сотрудник' } }), '');
});

test('assignee row stays between the title and slider while location remains after the slider', () => {
  const card = sourceOf('renderTaskCard');
  const template = card.slice(card.indexOf('return `<article'));
  assert.ok(template.indexOf('${assignee}') > template.indexOf('taskFeedCardHeader'));
  assert.ok(template.indexOf('${gallery}') > template.indexOf('${assignee}'));
  assert.ok(template.indexOf('taskLocation') > template.indexOf('${gallery}'));
  assert.match(app, /const assignee = renderTaskAssignee\(task\)/);
  assert.match(app, /apiFetch\('\/api\/v1\/manager\/tasks'\)/);
  assert.doesNotMatch(sourceOf('renderTaskAssignee'), /apiFetch|fetch\(/);
});

test('assignee slot uses the rendered title height and preserves the two-line rhythm', () => {
  const previousGapFromTitleText = 5 + 34.3;
  const naturalGap = 12.5 + 11 * 1.3 + 12.5;
  assert.equal(previousGapFromTitleText, naturalGap);
  assert.match(
    styles,
    /\.taskFeedCard\.has-task-assignee \.taskFeedCardHeader \{[\s\S]*?min-height:\s*0[\s\S]*?align-items:\s*flex-start[\s\S]*?padding:\s*5px 0 0[\s\S]*?margin-bottom:\s*0/,
  );
  assert.match(
    styles,
    /\.taskFeedCard \.taskAssigneeSlot \{[\s\S]*?align-items:\s*center[\s\S]*?padding-block:\s*12\.5px/,
  );
  assert.doesNotMatch(
    styles.match(/\.taskFeedCard \.taskAssigneeSlot \{[\s\S]*?\n}/)?.[0] ?? '',
    /min-height|height:/,
  );
  assert.match(styles, /\.taskFeedCard \.taskAssignee \{[\s\S]*?margin:\s*0/);
  assert.match(app, /const assigneeClass = assignee \? ' has-task-assignee' : ''/);
  assert.doesNotMatch(styles, /\.taskAssignee(?:Slot)?[^{]*\{[^}]*position:\s*absolute/);
});

test('manager titles wrap naturally while the unchanged worker header keeps its existing rules', () => {
  assert.match(
    styles,
    /\.taskFeedCard\.has-task-assignee h3 \{[\s\S]*?display:\s*block[\s\S]*?overflow-wrap:\s*anywhere[\s\S]*?-webkit-line-clamp:\s*unset/,
  );
  assert.match(
    styles,
    /\.taskFeedCardHeader \{[\s\S]*?min-height:\s*clamp\(52px, 14vw, 58px\)[\s\S]*?align-items:\s*center[\s\S]*?padding-block:\s*5px[\s\S]*?margin-bottom:\s*10px/,
  );
  assert.match(styles, /\.taskFeedCard h3 \{[\s\S]*?-webkit-line-clamp:\s*2/);
});

test('assigned and unassigned styles follow the card metadata design without overflow', () => {
  assert.match(
    styles,
    /\.taskFeedCard \.taskAssignee \{[\s\S]*?max-width:\s*100%[\s\S]*?overflow-wrap:\s*anywhere[\s\S]*?color:\s*var\(--muted\)[\s\S]*?font-size:\s*11px[\s\S]*?font-weight:\s*400/,
  );
  assert.match(
    styles,
    /\.taskFeedCard \.taskAssignee\.is-unassigned \{[\s\S]*?color:\s*var\(--accent\)[\s\S]*?font-weight:\s*600/,
  );
});

test('PhotoSlider and its preview scheduler remain outside the assignee implementation', () => {
  const assigneeSource = sourceOf('renderTaskAssignee');
  assert.doesNotMatch(assigneeSource, /PhotoSlider|preview|original|scheduler/i);
  assert.equal((app.match(/PhotoSlider\.render\(task\.photos/g) ?? []).length, 1);
});
