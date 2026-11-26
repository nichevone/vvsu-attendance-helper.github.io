#!/usr/bin/env python3
"""Fetch today's timetable for the configured VVSU group and write JSON."""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

GROUP_ID = "21033"
GROUP_NAME = "А/СОПИ-24-1"
BASE_URL = "https://www.vvsu.ru/timetable/"
POST_URL = "https://www.vvsu.ru/timetable/index.php"
TIME_ZONE = ZoneInfo("Asia/Vladivostok")
OUTPUT = Path("data/timetable.json")


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def parse_date(value: str):
    value = clean(value)
    for fmt in ("%d.%m.%Y", "%d.%m.%y", "%d.%m.%Y г."):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            pass
    match = re.search(r"(\d{1,2})\.(\d{1,2})\.(\d{2,4})", value)
    if match:
        day, month, year = map(int, match.groups())
        if year < 100:
            year += 2000
        from datetime import date
        return date(year, month, day)
    return None


def cell_text(row, selector: str) -> str:
    cell = row.select_one(selector)
    return clean(cell.get_text(" ", strip=True)) if cell else ""


def main() -> None:
    today = datetime.now(TIME_ZONE).date()
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (compatible; AttendanceTimetableBot/1.0)",
        "Referer": BASE_URL,
        "Origin": "https://www.vvsu.ru",
    })

    page = session.get(BASE_URL, timeout=30)
    page.raise_for_status()

    payload = {
        "filterQueryParams": [{
            "valueId": GROUP_ID,
            "valueData": GROUP_NAME,
            "hlBlockId": 46,
            "hlBlockFieldName": "UF_GROUP_NAME",
            "hlBlockFieldId": "UF_GROUP_ID",
        }]
    }
    response = session.post(POST_URL, json=payload, timeout=30)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    table = soup.select_one("#schedule tbody")
    if table is None:
        raise RuntimeError("Не найдена таблица расписания #schedule tbody. Возможно, сайт ВВГУ изменил структуру ответа.")

    lessons = []
    current_date = None
    for row in table.select("tr"):
        date_cell = row.select_one('td[data-th="Дата"]')
        if date_cell:
            parsed = parse_date(date_cell.get_text(" ", strip=True))
            if parsed:
                current_date = parsed

        if current_date != today:
            continue

        lesson = {
            "date": today.strftime("%d.%m.%Y"),
            "time": cell_text(row, 'td[data-th="Время"]'),
            "discipline": cell_text(row, 'td[data-th="Дисциплина"]'),
            "type": cell_text(row, 'td[data-th="Занятие"]'),
            "room": cell_text(row, 'td[data-th="Аудитория"]'),
            "teacher": cell_text(row, 'td[data-th="Преподаватель"]'),
        }
        if any(lesson[key] for key in ("time", "discipline", "type", "room", "teacher")):
            lessons.append(lesson)

    result = {
        "group_id": GROUP_ID,
        "group_name": GROUP_NAME,
        "date": today.strftime("%d.%m.%Y"),
        "date_iso": today.isoformat(),
        "updated_at": datetime.now(TIME_ZONE).isoformat(timespec="seconds"),
        "timezone": "Asia/Vladivostok",
        "lessons": lessons,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Записано занятий на {result['date']}: {len(lessons)}")


if __name__ == "__main__":
    main()
