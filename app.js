const STORAGE_KEY = 'attendance-app-v1';
const DATA_URL = 'data/timetable.json';
let timetable = null;
let state = loadState();

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { students: [], attendance: {} }; }
  catch { return { students: [], attendance: {} }; }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function todayKey() { return timetable?.date_iso || new Date().toISOString().slice(0, 10); }
function lessonKey(lesson, index) { return `${todayKey()}_${index}_${lesson.time}_${lesson.discipline}`; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function setStatus(message, type = '') {
  const el = document.getElementById('status');
  el.textContent = message;
  el.className = `status ${type}`;
}

async function loadTimetable() {
  const refresh = document.getElementById('refreshBtn');
  refresh.disabled = true;
  setStatus('Загружаю расписание…');
  try {
    const response = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    timetable = await response.json();
    if (!Array.isArray(timetable.lessons)) throw new Error('В JSON отсутствует список занятий');
    document.getElementById('todayLabel').textContent = `Расписание на ${timetable.date}`;
    const updated = timetable.updated_at ? new Date(timetable.updated_at).toLocaleString('ru-RU') : 'неизвестно';
    document.getElementById('updatedLabel').textContent = `Последнее обновление: ${updated}`;
    setStatus('Расписание загружено', 'ok');
    renderLessons();
    renderAttendance();
    updateReport();
  } catch (error) {
    timetable = null;
    document.getElementById('todayLabel').textContent = 'Не удалось загрузить расписание';
    document.getElementById('updatedLabel').textContent = '';
    setStatus(`Ошибка: ${error.message}. Проверь, опубликован ли data/timetable.json.`, 'error');
    renderLessons();
    document.getElementById('attendanceTableWrap').hidden = true;
    document.getElementById('studentsEmpty').hidden = state.students.length > 0;
    document.getElementById('reportText').value = 'Расписание пока недоступно.';
  } finally { refresh.disabled = false; }
}

function renderLessons() {
  const list = document.getElementById('lessonsList');
  const empty = document.getElementById('lessonsEmpty');

  list.innerHTML = '';
  if (!timetable) {
    empty.hidden = false;
    empty.textContent = 'Расписание пока недоступно.';
    return;
  }
  if (!timetable.lessons.length) {
    empty.hidden = false;
    empty.textContent = 'На сегодня занятий не найдено.';
    return;
  }

  empty.hidden = true;
  list.innerHTML = timetable.lessons.map((lesson, index) => {
    const title = [lesson.discipline, lesson.type].filter(Boolean).join(' — ') || `Пара ${index + 1}`;
    const meta = [lesson.time, lesson.room ? `ауд. ${lesson.room}` : '', lesson.teacher].filter(Boolean).join(' · ');
    return `<li class="lesson-item">
      <span class="lesson-number">${index + 1}</span>
      <div class="lesson-info">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(meta || 'Дополнительная информация отсутствует')}</span>
      </div>
    </li>`;
  }).join('');
}

function renderAttendance() {
  const empty = document.getElementById('studentsEmpty');
  const wrap = document.getElementById('attendanceTableWrap');
  const table = document.getElementById('attendanceTable');
  const clearButton = document.getElementById('clearStudentsBtn');
  if (clearButton) clearButton.disabled = state.students.length === 0;

  if (!state.students.length) {
    empty.hidden = false;
    wrap.hidden = true;
    empty.textContent = 'Добавь студентов вручную или импортируй список.';
    return;
  }
  empty.hidden = true;
  if (!timetable || !timetable.lessons.length) {
    wrap.hidden = true;
    return;
  }

  const rows = state.students.map((name, studentIndex) => {
    const buttons = timetable.lessons.map((lesson, lessonIndex) => {
      const key = lessonKey(lesson, lessonIndex);
      const present = state.attendance[key]?.[name] === true;
      return `<div class="attendance-toggle" role="group" aria-label="Посещаемость: ${escapeHtml(name)}, пара ${lessonIndex + 1}" data-lesson-label="${lessonIndex + 1}">
        <button type="button" class="present ${present ? 'active' : ''}" data-lesson="${lessonIndex}" data-student="${studentIndex}" data-value="present" aria-label="Пара ${lessonIndex + 1}: был" aria-pressed="${present}">Был</button>
        <button type="button" class="absent ${!present ? 'active' : ''}" data-lesson="${lessonIndex}" data-student="${studentIndex}" data-value="absent" aria-label="Пара ${lessonIndex + 1}: не был" aria-pressed="${!present}">Не был</button>
      </div>`;
    }).join('');
    return `<tr>
      <td><div class="student-cell"><span>${escapeHtml(name)}</span><button type="button" class="remove-student" data-remove="${studentIndex}" aria-label="Удалить ${escapeHtml(name)}">Удалить</button></div></td>
      <td class="attendance-buttons-cell"><div class="attendance-buttons">${buttons}</div></td>
    </tr>`;
  }).join('');

  table.innerHTML = `<thead><tr><th scope="col">Студент</th><th scope="col">Отметки посещаемости</th></tr></thead><tbody>${rows}</tbody>`;
  wrap.hidden = false;

  table.querySelectorAll('[data-value]').forEach(button => button.addEventListener('click', () => {
    const lessonIndex = Number(button.dataset.lesson);
    const studentIndex = Number(button.dataset.student);
    const name = state.students[studentIndex];
    const key = lessonKey(timetable.lessons[lessonIndex], lessonIndex);
    state.attendance[key] ||= {};
    state.attendance[key][name] = button.dataset.value === 'present';
    saveState();
    renderAttendance();
    updateReport();
  }));
  table.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => {
    const index = Number(button.dataset.remove);
    const name = state.students[index];
    if (!confirm(`Удалить студента «${name}»?`)) return;
    state.students.splice(index, 1);
    saveState();
    renderAttendance();
    updateReport();
  }));
}

function makeReport() {
  if (!timetable) return 'Расписание не загружено.';
  const lines = [`${timetable.date} не было:`, ''];
  timetable.lessons.forEach((lesson, index) => {
    const title = [lesson.time, lesson.discipline, lesson.type].filter(Boolean).join(' — ') || `Занятие ${index + 1}`;
    lines.push(title);
    const key = lessonKey(lesson, index);
    if (!state.students.length) {
      lines.push('список студентов не заполнен');
    } else {
      const absent = state.students.filter(name => state.attendance[key]?.[name] !== true);
      if (absent.length) absent.forEach(name => lines.push(`${name},`));
      else lines.push('были все');
    }
    lines.push('');
  });
  return lines.join('\n').trimEnd() + '\n';
}
function updateReport() { document.getElementById('reportText').value = makeReport(); }

// Student creation

document.getElementById('addStudentForm').addEventListener('submit', event => {
  event.preventDefault();
  const input = document.getElementById('studentName');
  const name = input.value.trim();
  if (!name) return;
  if (state.students.some(existing => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    alert('Такой студент уже есть в списке.');
    return;
  }
  state.students.push(name);
  input.value = '';
  saveState();
  renderAttendance();
  updateReport();
});

document.getElementById('clearStudentsBtn').addEventListener('click', () => {
  if (!state.students.length) return;
  const approved = confirm('Удалить всех студентов и все отметки посещаемости? Это действие нельзя отменить.');
  if (!approved) return;

  state.students = [];
  state.attendance = {};
  saveState();
  renderAttendance();
  updateReport();
  setStatus('Список студентов и отметки посещаемости очищены', 'ok');
});

document.getElementById('importFile').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  const content = await file.text();
  const names = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    .map(line => line.split(/[;,\t]/)[0].trim()).filter(Boolean);
  let added = 0;
  for (const name of names) {
    if (!state.students.some(existing => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      state.students.push(name);
      added++;
    }
  }
  saveState();
  renderAttendance();
  updateReport();
  setStatus(`Импортировано студентов: ${added}`, 'ok');
  event.target.value = '';
});

// Report actions are placed below the generated report text.
document.getElementById('copyBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(makeReport());
    setStatus('Отчёт скопирован в буфер обмена', 'ok');
  } catch {
    const report = document.getElementById('reportText');
    report.focus();
    report.select();
    setStatus('Автоматическое копирование недоступно. Текст отчёта выделен, скопируй его вручную.', 'error');
  }
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([makeReport()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `attendance-${todayKey()}.txt`;
  link.click();
  URL.revokeObjectURL(url);
});
document.getElementById('refreshBtn').addEventListener('click', loadTimetable);

renderLessons();
renderAttendance();
updateReport();
loadTimetable();
