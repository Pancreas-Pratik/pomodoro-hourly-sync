"""Collect publicly visible Anki Leaderboard stats for opted-in users.

Triggered every five minutes by GitHub Actions.
Replaces the current Anki day's snapshot; last successful pre-04:00 capture
remains as the historical calendar snapshot. No GitHub commit, no Discord posting.
Public website markup may change: failures are reported rather than inventing stats.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import unicodedata
from datetime import datetime, timedelta
from urllib.parse import urljoin, urlparse
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

ROOT = 'https://shigeyuki.pythonanywhere.com/'
ET = ZoneInfo('America/New_York')

# Usernames are discovered dynamically from Supabase registrations.
# There are intentionally NO usernames embedded in this source code.
TABS = ('reviews', 'time', 'streak', 'retention')
HEADERS = {'User-Agent': 'MinimalPomoStudyBoard/1.0 (+public stats; low-frequency; GitHub Actions)'}


def key(value: str) -> str:
    return unicodedata.normalize('NFKC', str(value)).casefold().strip()


def compact(value: str) -> str:
    return re.sub(r'\s+', ' ', str(value)).strip()


def number(text: str):
    match = re.search(r'(?<!\d)\d[\d,]*', str(text))
    return int(match.group().replace(',', '')) if match else None


def minutes(text: str):
    """Parse 00h 50m / 01:45:00 / 50 min / 50 / 1.5 h."""
    raw = compact(text).lower()
    h = re.search(r'(\d+(?:\.\d+)?)\s*(?:h|hours?)\b', raw)
    m = re.search(r'(\d+(?:\.\d+)?)\s*(?:m|min|minutes?)\b', raw)
    if h or m:
        return round((float(h.group(1)) if h else 0) * 60 + (float(m.group(1)) if m else 0))
    clock = re.search(r'(?<!\d)(\d{1,3}):(\d{2})(?::(\d{2}))?(?!\d)', raw)
    if clock:
        if clock.group(3) is not None:
            return int(clock.group(1)) * 60 + int(clock.group(2))
        return int(clock.group(1)) * 60 + int(clock.group(2))
    return number(raw)


def retention(text: str):
    match = re.search(r'(\d{1,3}(?:\.\d+)?)\s*%', str(text))
    return float(match.group(1)) if match else None


def metric_value(metric: str, text: str):
    if metric == 'time':
        return minutes(text)
    if metric == 'retention':
        return retention(text)
    return number(text)


def fetch(session: requests.Session, url: str) -> tuple[BeautifulSoup, str]:
    last_error = None
    for attempt in range(3):
        try:
            result = session.get(url, timeout=35)
            result.raise_for_status()
            if len(result.content) > 25_000_000:
                raise ValueError('Unexpectedly large leaderboard response')
            return BeautifulSoup(result.text, 'html.parser'), result.url
        except (requests.RequestException, ValueError) as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(2 + attempt * 3)
    raise RuntimeError(f'Unable to load {url}: {last_error}')


def tab_links(soup: BeautifulSoup, page_url: str):
    """Discover real links instead of guessing the website's route names."""
    urls = {'reviews': ROOT}
    for anchor in soup.find_all('a', href=True):
        label = key(compact(anchor.get_text(' ', strip=True)))
        if label not in TABS:
            continue
        raw = anchor.get('href', '').strip()
        if not raw or raw == '#' or raw.lower().startswith('javascript:'):
            continue
        target = urljoin(page_url, raw)
        if urlparse(target).netloc == urlparse(ROOT).netloc:
            urls[label] = target
    return urls


def identify_headers(cells: list[str]):
    headers = [key(c) for c in cells]
    if not any('user' in v or v == 'name' for v in headers):
        return None
    def at(*needles):
        for needle in needles:
            for i, value in enumerate(headers):
                if needle in value:
                    return i
        return None
    return {
        'username': at('username', 'user name', 'name'),
        'reviews': at('reviews today', 'reviews', 'review'),
        'time': at('minutes today', 'time today', 'minutes', 'time'),
        'streak': at('streak'),
        'retention': at('retention'),
        'review_rank': at('rank', '#'),
    }


def extract_table(soup: BeautifulSoup, wanted: dict[str, dict], view: str) -> int:
    """Extract rows from any table containing a Username column.

    The site has separate Reviews/Time/Streak/Retention views. In each,
    the view-specific measurement is usually the third table column.
    """
    changes = 0
    for table in soup.find_all('table'):
        rows = table.find_all('tr')
        if not rows:
            continue
        header_index, mapping = None, None
        for i, row in enumerate(rows[:4]):
            header = [compact(x.get_text(' ', strip=True)) for x in row.find_all(['th', 'td'], recursive=False)]
            mapping = identify_headers(header)
            if mapping is not None:
                header_index = i
                break
        if header_index is None or mapping is None:
            continue

        user_i = mapping['username']
        # Some tabs title their data column as the active metric.
        active_index = mapping.get(view)
        if active_index is None and view != 'reviews':
            active_index = mapping['reviews'] if view == 'time' else None
        for row in rows[header_index + 1:]:
            cells = row.find_all(['th', 'td'], recursive=False)
            if user_i is None or user_i >= len(cells):
                continue
            display = compact(cells[user_i].get_text(' ', strip=True))
            id_key = key(display)
            if id_key not in wanted:
                continue
            item = wanted[id_key]
            for metric in TABS:
                ix = mapping.get(metric)
                if ix is None or ix >= len(cells):
                    continue
                candidate = metric_value(metric, cells[ix].get_text(' ', strip=True))
                if candidate is not None:
                    item[{'time': 'minutes'}.get(metric, metric)] = candidate
                    changes += 1
            # Sometimes a view has generic '# Username Score' columns.
            if active_index is None and view in TABS and len(cells) >= 3:
                active_index = 2 if mapping['username'] == 1 else None
            if active_index is not None and active_index < len(cells):
                candidate = metric_value(view, cells[active_index].get_text(' ', strip=True))
                if candidate is not None:
                    item[{'time': 'minutes'}.get(view, view)] = candidate
                    changes += 1
            # Only the reviews page's rank is the review rank.
            if view == 'reviews':
                rank_idx = mapping['review_rank']
                if rank_idx is not None and rank_idx < len(cells):
                    item['review_rank'] = number(cells[rank_idx].get_text(' ', strip=True))
            anchor = cells[user_i].find('a', href=True)
            if anchor:
                item['_profile_url'] = urljoin(ROOT, anchor['href'])
    return changes


def extract_profile(soup: BeautifulSoup, item: dict) -> None:
    """Fallback for username pages that list labeled fields instead of tables."""
    for row in soup.select('tr'):
        cells = row.find_all(['th', 'td'], recursive=False)
        if len(cells) < 2:
            continue
        label = key(cells[0].get_text(' ', strip=True))
        value = cells[1].get_text(' ', strip=True)
        for metric in TABS:
            if metric in label:
                result = metric_value(metric, value)
                if result is not None:
                    item[{'time': 'minutes'}.get(metric, metric)] = result


def scrape(usernames: list[str]) -> list[dict]:
    data = {key(name): {
        'username': name,
        'reviews': None,
        'minutes': None,
        'streak': None,
        'retention': None,
        'review_rank': None,
    } for name in usernames}
    with requests.Session() as session:
        session.headers.update(HEADERS)
        soup, root_url = fetch(session, ROOT)
        links = tab_links(soup, root_url)
        print('Discovered leaderboard tabs:', sorted(links))
        extract_table(soup, data, 'reviews')
        visited = {root_url}
        for view in ('time', 'streak', 'retention'):
            target = links.get(view)
            if not target or target in visited:
                print(f'WARNING: No distinct {view} tab URL discovered; values may be missing.')
                continue
            visited.add(target)
            try:
                page, _ = fetch(session, target)
                extract_table(page, data, view)
            except RuntimeError as exc:
                print(f'WARNING: {exc}')
        # User details may expose missing stats even if their ranking has changed.
        for item in data.values():
            target = item.pop('_profile_url', None)
            if not target or urlparse(target).netloc != urlparse(ROOT).netloc:
                continue
            if all(item[k] is not None for k in TABS if k != 'time') and item['minutes'] is not None:
                continue
            try:
                page, _ = fetch(session, target)
                extract_table(page, {key(item['username']): item}, 'reviews')
                extract_profile(page, item)
            except RuntimeError as exc:
                print(f'WARNING: profile for {item["username"]}: {exc}')
    rows = list(data.values())
    good = sum(any(row[m] is not None for m in ('reviews', 'minutes', 'streak', 'retention')) for row in rows)
    if not good:
        raise RuntimeError('Could not parse any requested user; refusing to overwrite stored snapshots.')
    for row in rows:
        missing = [m for m in ('reviews', 'minutes', 'streak', 'retention') if row[m] is None]
        if missing:
            print(f'WARNING: {row["username"]} missing {", ".join(missing)} (displayed as —)')
    return rows


def load_registrations() -> list[dict]:
    """Fetch opted-in registrations; never log board keys or study names."""
    base = os.environ.get('SUPABASE_URL', '').rstrip('/')
    secret = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not base or not secret:
        raise RuntimeError('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
    found: dict[tuple[str, str], dict] = {}
    with requests.Session() as session:
        session.headers.update({
            'apikey': secret,
            'Authorization': f'Bearer {secret}',
        })
        page_size = 500
        for offset in range(0, 5000, page_size):
            result = session.get(f'{base}/rest/v1/pomo_anki_registrations',
                params={
                    'select': 'board_key,study_name_key,anki_username',
                    'order': 'anki_username.asc',
                    'limit': str(page_size),
                    'offset': str(offset),
                }, timeout=30)
            result.raise_for_status()
            records = result.json()
            if not isinstance(records, list):
                raise RuntimeError('Invalid Supabase registration response')
            for row in records:
                name = compact(row.get('anki_username', ''))
                board = str(row.get('board_key', ''))
                study = str(row.get('study_name_key', ''))
                if name and board and study:
                    found[(board, study)] = {
                        'board_key': board, 'study_name_key': study,
                        'anki_username': name,
                    }
            if len(records) < page_size:
                break
        else:
            print('WARNING: Registration list capped at 5000 entries; increase pagination if needed.')
    records = list(found.values())
    print(f'Found {len(records)} opted-in Anki registrations.')
    return records


def save_daily_members(registrations: list[dict], day: str) -> None:
    """Archive the opted-in roster per Discord board without exposing it publicly."""
    base = os.environ['SUPABASE_URL'].rstrip('/')
    secret = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    rows = [{**registration, 'anki_day': day} for registration in registrations]
    if not rows:
        return
    with requests.Session() as session:
        session.headers.update({
            'apikey': secret, 'Authorization': f'Bearer {secret}',
            'Content-Type': 'application/json',
        })
        # Small batches to avoid oversized POSTs when the public app grows.
        for i in range(0, len(rows), 250):
            response = session.post(
                f'{base}/rest/v1/pomo_anki_daily_members'
                '?on_conflict=anki_day,board_key,study_name_key',
                headers={'Prefer': 'resolution=merge-duplicates,return=minimal'},
                json=rows[i:i+250], timeout=35,
            )
            if not response.ok:
                raise RuntimeError(f'Historical membership save failed ({response.status_code}): '
                                   f'{response.text[:500]}')
    print(f'Saved historical membership for {len(rows)} registrations on Anki day {day}.')


def post_to_supabase(rows: list[dict], day: str) -> None:
    base = os.environ.get('SUPABASE_URL', '').rstrip('/')
    secret = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not base or not secret:
        raise RuntimeError('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set as Actions environment/secret.')
    now_iso = datetime.now(ZoneInfo('UTC')).isoformat()
    payload = [{**row, 'anki_day': day, 'captured_at': now_iso} for row in rows]
    # Keep all registered names in the snapshot, even if absent
    # from the source that day. Missing metrics remain NULL (shown as —), not 0.
    # If every user is missing, scrape() fails before reaching this point.
    # On the second daily run, a blank/failed field must not erase an earlier good value.
    read_url = f'{base}/rest/v1/pomo_anki_snapshots'
    with requests.Session() as session:
        session.headers.update({
            'apikey': secret,
            'Authorization': f'Bearer {secret}',
            'Content-Type': 'application/json',
        })
        old = session.get(read_url,
            params={'select': 'username,reviews,minutes,streak,retention,review_rank',
                    'anki_day': f'eq.{day}'}, timeout=25)
        old.raise_for_status()
        by_user = {key(o['username']): o for o in old.json()}
        for new in payload:
            prior = by_user.get(key(new['username']), {})
            for field in ('reviews', 'minutes', 'streak', 'retention', 'review_rank'):
                if new[field] is None:
                    new[field] = prior.get(field)
        result = session.post(f'{read_url}?on_conflict=anki_day,username',
            headers={'Prefer': 'resolution=merge-duplicates,return=minimal'},
            json=payload, timeout=35)
        if not result.ok:
            raise RuntimeError(f'Supabase insert failed ({result.status_code}): {result.text[:600]}')
    print(f'Saved {len(payload)} leaderboard users for Anki day {day} at {now_iso}')


def anki_day(local: datetime) -> str:
    """Dates use 4 AM Eastern as the rollover, not midnight."""
    return (local - timedelta(hours=4)).date().isoformat()


def main():
    started = datetime.now(ET)
    day = anki_day(started)
    print('Anki day:', day, 'time ET:', started.strftime('%Y-%m-%d %I:%M %p %Z'))
    registrations = load_registrations()
    if not registrations:
        print('No Anki usernames registered in any channel yet; nothing to fetch.')
        return
    unique_names = {key(r['anki_username']): r['anki_username'] for r in registrations}
    rows = scrape(list(unique_names.values()))
    finished = datetime.now(ET)
    if anki_day(finished) != day:
        # Crossing the reset during a scrape makes its values ambiguous;
        # the previous successful run remains archived, so skip this one.
        print('Anki rollover occurred during scraping. Discarding this run; next run will retry.')
        return
    post_to_supabase(rows, day)
    save_daily_members(registrations, day)
    if started.hour == 3:
        print('Pre-rollover snapshot updated; latest success before 04:00 is calendar history.')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
