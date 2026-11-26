const STORAGE_KEY = 'attendance-app-v1';
const DATA_URL = 'data/timetable.json';

let timetable = null;
let state = loadState();

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));

    return {
      students: Array.isArray(parsed?.students) ? parsed.students : [],
      attendance: parsed?.attendance && typeof parsed.attendance === 'object'
      ? parsed.attendance
      : {}
    };
  } catch {
    return {
      students: [],
      attendance: {}
    };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function todayKey() {
  if (timetable?.date_iso) {
    return timetable.date_iso;
  }

  const now = new Date();
  const offset = now.getTimezoneOffset();
  const localDate = new Date(now.getTime() - offset * 60 * 1000);

  return localDate.toISOString().slice(0, 10);
}

function lessonKey(lesson, index) {
  if (lesson?.id) {
    return `${todayKey()}_${lesson.id}`;
  }

  const time = lesson?.time ?? '';
  const discipline = lesson?.discipline ?? '';

  return `${todayKey()}_${index}_${time}_${discipline}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));
}

function setStatus(message, type = '') {
  const statusElement = document.getElementById('status');

  statusElement.textContent = message;
  statusElement.className = `status ${type}`;
}

async function loadTimetable() {
  const refreshButton = document.getElementById('refreshBtn');

  refreshButton.disabled = true;
  setStatus('Загружаю расписание…');

  try {
    const response = await fetch(`${DATA_URL}?v=${Date.now()}`, {
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    timetable = await response.json();

    if (!Array.isArray(timetable.lessons)) {
      throw new Error('В JSON отсутствует список занятий');
    }

    document.getElementById('todayLabel').textContent =
    `Расписание на ${timetable.date}`;

    const updatedAt = timetable.updated_at
    ? new Date(timetable.updated_at).toLocaleString('ru-RU')
    : 'неизвестно';

    document.getElementById('updatedLabel').textContent =
    `Последнее обновление: ${updatedAt}`;

    setStatus('Расписание загружено', 'ok');
    renderLessons();
    renderAttendance();
    updateReport();
  } catch (error) {
    timetable = null;

    document.getElementById('todayLabel').textContent =
    'Не удалось загрузить расписание';
    document.getElementById('updatedLabel').textContent = '';

    setStatus(`Ошибка: ${error.message}`, 'error');
    renderLessons();
    renderAttendance();
    updateReport();

    document.getElementById('attendanceTableWrap').hidden = true;
    document.getElementById('studentsEmpty').hidden =
    state.students.length > 0;
    document.getElementById('reportText').value =
    'Расписание пока недоступно';
  } finally {
    refreshButton.disabled = false;
  }
}

function renderLessons() {
  const lessonsList = document.getElementById('lessonsList');
  const lessonsEmpty = document.getElementById('lessonsEmpty');

  lessonsList.innerHTML = '';

  if (!timetable) {
    lessonsEmpty.hidden = false;
    lessonsEmpty.textContent = 'Расписание пока недоступно';
    return;
  }

  if (!timetable.lessons.length) {
    lessonsEmpty.hidden = false;
    lessonsEmpty.textContent = 'На сегодня занятий не найдено';
    return;
  }

  lessonsEmpty.hidden = true;

  lessonsList.innerHTML = timetable.lessons.map((lesson, index) => {
    const title = [
      lesson.discipline,
      lesson.type
    ].filter(Boolean).join(' — ') || `Пара ${index + 1}`;

    const meta = [
      lesson.time,
      lesson.room ? `ауд. ${lesson.room}` : '',
      lesson.teacher
    ].filter(Boolean).join(' · ');

    return `
    <li class="lesson-item">
    <span class="lesson-number">${index + 1}</span>
    <div class="lesson-info">
    <strong>${escapeHtml(title)}</strong>
    <span>${escapeHtml(meta || 'Дополнительная информация отсутствует')}</span>
    </div>
    </li>
    `;
  }).join('');
}

function renderAttendance() {
  const studentsEmpty = document.getElementById('studentsEmpty');
  const tableWrap = document.getElementById('attendanceTableWrap');
  const table = document.getElementById('attendanceTable');
  const clearButton = document.getElementById('clearStudentsBtn');

  if (clearButton) {
    clearButton.disabled = state.students.length === 0;
  }

  if (!state.students.length) {
    studentsEmpty.hidden = false;
    tableWrap.hidden = true;
    studentsEmpty.textContent =
    'Добавь студентов вручную или импортируй список';
  return;
  }

  studentsEmpty.hidden = true;

  const lessons = timetable?.lessons || [];

  const rows = state.students.map((name, studentIndex) => {
    const buttons = lessons.map((lesson, lessonIndex) => {
      const key = lessonKey(lesson, lessonIndex);
      const present = state.attendance[key]?.[name] === true;

      return `
      <div
      class="attendance-toggle"
      role="group"
      aria-label="Посещаемость: ${escapeHtml(name)}, пара ${lessonIndex + 1}"
      >
      <button
      type="button"
      class="present ${present ? 'active' : ''}"
      data-lesson="${lessonIndex}"
      data-student="${studentIndex}"
      data-value="present"
      aria-label="Пара ${lessonIndex + 1}: +"
      aria-pressed="${present}"
      >+</button>

      <button
      type="button"
      class="absent ${!present ? 'active' : ''}"
      data-lesson="${lessonIndex}"
      data-student="${studentIndex}"
      data-value="absent"
      aria-label="Пара ${lessonIndex + 1}: N"
      aria-pressed="${!present}"
      >N</button>
      </div>
      `;
    }).join('');

    return `
    <tr>
    <td>
    <div class="student-cell">
    <span>${studentIndex + 1}. ${escapeHtml(name)}</span>
    <button
    type="button"
    class="remove-student"
    data-remove="${studentIndex}"
    aria-label="Удалить ${escapeHtml(name)}"
    >Удалить</button>
    </div>
    </td>
    <td class="attendance-buttons-cell">
    <div class="attendance-buttons">${buttons}</div>
    </td>
    </tr>
    `;
  }).join('');

  table.innerHTML = `
  <thead>
  <tr>
  <th scope="col">Студент</th>
  <th scope="col">Отметки посещаемости</th>
  </tr>
  </thead>
  <tbody>${rows}</tbody>
  `;

  tableWrap.hidden = false;
}

function makeReport() {
  if (!timetable) {
    return 'Расписание не загружено';
  }

  if (!state.students.length) {
    return 'Список студентов не заполнен';
  }

  const lines = [`${timetable.date} не было:`];

  timetable.lessons.forEach((lesson, index) => {
    const title = lesson.discipline && lesson.type
    ? `${lesson.discipline} (${lesson.type})`
    : `Занятие ${index + 1}`;

    const key = lessonKey(lesson, index);

    const absent = state.students.filter(
      name => state.attendance[key]?.[name] !== true
    );

    lines.push('');
    lines.push(title);

    if (absent.length) {
      lines.push(`${absent.join(',')} + '\n'`);
    } else {
      lines.push('Были все');
    }
  });

  return lines.join('\n') + '\n';
}

function updateReport() {
  document.getElementById('reportText').value = makeReport();
}

function toggleAttendance(button) {
  const lessonIndex = Number(button.dataset.lesson);
  const studentIndex = Number(button.dataset.student);

  const lesson = timetable?.lessons?.[lessonIndex];
  const name = state.students[studentIndex];

  if (!lesson || !name) {
    return;
  }

  const key = lessonKey(lesson, lessonIndex);

  state.attendance[key] ||= {};
  state.attendance[key][name] = button.dataset.value === 'present';

  saveState();
  renderAttendance();
  updateReport();
}

function removeStudent(button) {
  const index = Number(button.dataset.remove);
  const name = state.students[index];

  if (!name) {
    return;
  }

  if (!confirm(`Удалить студента «${name}»?`)) {
    return;
  }

  state.students.splice(index, 1);
  saveState();
  renderAttendance();
  updateReport();
}

document.getElementById('addStudentForm').addEventListener('submit', event => {
  event.preventDefault();

  const input = document.getElementById('studentName');
  const name = input.value.trim();

  if (!name) {
    return;
  }

  const isDuplicate = state.students.some(
    existing => existing.toLowerCase() === name.toLowerCase()
  );

  if (isDuplicate) {
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
  if (!state.students.length) {
    return;
  }

  const approved = confirm(
    'Удалить всех студентов и все отметки посещаемости? Это действие нельзя отменить'
  );

  if (!approved) {
    return;
  }

  state.students = [];
  state.attendance = {};

  saveState();
  renderAttendance();
  updateReport();

  setStatus('Список студентов и отметки посещаемости очищены', 'ok');
});

document.getElementById('importFile').addEventListener('change', async event => {
  const file = event.target.files[0];

  if (!file) {
    return;
  }

  const content = await file.text();

  const names = content
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(Boolean)
  .map(line => line.split(/[;,\t]/)[0].trim())
  .filter(Boolean);

  let added = 0;
  let skipped = 0;

  for (const name of names) {
    const isDuplicate = state.students.some(
      existing => existing.toLowerCase() === name.toLowerCase()
    );

    if (isDuplicate) {
      skipped++;
      continue;
    }

    state.students.push(name);
    added++;
  }

  saveState();
  renderAttendance();
  updateReport();

  setStatus(
    `Импортировано студентов: ${added}${skipped ? `, пропущено дубликатов: ${skipped}` : ''}`,
    'ok'
  );

  event.target.value = '';
});

document.getElementById('attendanceTable').addEventListener('click', event => {
  const button = event.target.closest('button');

  if (!button) {
    return;
  }

  if (button.dataset.value) {
    toggleAttendance(button);
    return;
  }

  if (button.dataset.remove !== undefined) {
    removeStudent(button);
  }
});

document.getElementById('copyBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(makeReport());
    setStatus('Отчёт скопирован в буфер обмена', 'ok');
  } catch {
    const report = document.getElementById('reportText');

    report.focus();
    report.select();

    setStatus(
      'Автоматическое копирование недоступно. Текст отчёта выделен, скопируй его вручную',
      'error'
    );
  }
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([makeReport()], {
    type: 'text/plain;charset=utf-8'
  });

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

