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
function setStatus(message, type = '') { const el = document.getElementById('status'); el.textContent = message; el.className = `status ${type}`; }

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
  } catch (error) {
    document.getElementById('todayLabel').textContent = 'Не удалось загрузить расписание';
    setStatus(`Ошибка: ${error.message}. Проверь, опубликован ли data/timetable.json.`, 'error');
    document.getElementById('lessons').innerHTML = '<div class="lesson-empty">Расписание пока недоступно. Можно добавить студентов; отметки появятся после загрузки расписания.</div>';
  } finally { refresh.disabled = false; }
}

function renderStudents() {
  const list = document.getElementById('studentsList');
  document.getElementById('studentsEmpty').hidden = state.students.length > 0;
  list.innerHTML = state.students.map((name, i) => `<li class="student-row"><span>${escapeHtml(name)}</span><button type="button" data-remove="${i}" aria-label="Удалить ${escapeHtml(name)}">Удалить</button></li>`).join('');
  list.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => {
    const index = Number(button.dataset.remove);
    state.students.splice(index, 1);
    saveState(); renderStudents(); renderLessons();
  }));
}

function renderLessons() {
  const root = document.getElementById('lessons');
  if (!timetable) return;
  if (!timetable.lessons.length) {
    root.innerHTML = '<div class="lesson-empty">На сегодня занятий не найдено.</div>';
    return;
  }
  root.innerHTML = timetable.lessons.map((lesson, index) => {
    const key = lessonKey(lesson, index);
    const title = [lesson.discipline, lesson.type].filter(Boolean).join(' — ') || 'Занятие';
    const meta = [lesson.time, lesson.room ? `ауд. ${lesson.room}` : '', lesson.teacher].filter(Boolean).join(' · ');
    const roster = state.students.length ? state.students.map((name, studentIndex) => {
      const present = state.attendance[key]?.[name] === true;
      return `<div class="attendance-row"><span class="student-name">${escapeHtml(name)}</span><div class="attendance-buttons"><button type="button" class="present ${present ? 'active' : ''}" data-lesson="${index}" data-student="${studentIndex}" data-value="present" aria-label="${escapeHtml(name)}: был">✓ Был</button><button type="button" class="absent ${!present ? 'active' : ''}" data-lesson="${index}" data-student="${studentIndex}" data-value="absent" aria-label="${escapeHtml(name)}: не был">✕ Не был</button></div></div>`;
    }).join('') : '<p class="muted small" style="margin-top:14px">Сначала добавь список студентов.</p>';
    return `<article class="lesson-card"><div class="lesson-title"><div><h3>${escapeHtml(title)}</h3><p class="lesson-meta">${escapeHtml(meta)}</p></div><span class="muted small">Пара ${index + 1}</span></div>${roster}</article>`;
  }).join('');
  root.querySelectorAll('[data-value]').forEach(button => button.addEventListener('click', () => {
    const lessonIndex = Number(button.dataset.lesson);
    const studentIndex = Number(button.dataset.student);
    const name = state.students[studentIndex];
    const key = lessonKey(timetable.lessons[lessonIndex], lessonIndex);
    state.attendance[key] ||= {};
    state.attendance[key][name] = button.dataset.value === 'present';
    saveState(); renderLessons();
  }));
}

document.getElementById('addStudentForm').addEventListener('submit', event => {
  event.preventDefault();
  const input = document.getElementById('studentName');
  const name = input.value.trim();
  if (!name) return;
  if (state.students.some(existing => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) { alert('Такой студент уже есть в списке.'); return; }
  state.students.push(name); input.value = ''; saveState(); renderStudents(); renderLessons();
});

document.getElementById('importFile').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  const names = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => line.split(/[;,\t]/)[0].trim()).filter(Boolean);
  let added = 0;
  for (const name of names) {
    if (!state.students.some(existing => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) { state.students.push(name); added++; }
  }
  saveState(); renderStudents(); renderLessons();
  setStatus(`Импортировано студентов: ${added}`, 'ok');
  event.target.value = '';
});

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

document.getElementById('copyBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(makeReport());
    setStatus('Отчёт скопирован в буфер обмена', 'ok');
  } catch {
    setStatus('Не удалось скопировать. Используй скачивание TXT.', 'error');
  }
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([makeReport()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `attendance-${todayKey()}.txt`; link.click();
  URL.revokeObjectURL(url);
});
document.getElementById('refreshBtn').addEventListener('click', loadTimetable);

renderStudents();
loadTimetable();
