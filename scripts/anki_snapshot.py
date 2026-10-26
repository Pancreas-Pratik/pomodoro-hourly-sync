"""Minimal Pomo: fetch opt-in users' PUBLIC Anki profile scores on an hourly schedule.

One snapshot per username per Anki day (4 AM Eastern rollover): the last
successful pre-rollover write becomes that day's calendar history.
No usernames are hard-coded; names are read from registered Supabase users.
No GitHub commits or Discord posts.
"""
from __future__ import annotations

import os
import re
import sys
import time
import unicodedata
from datetime import datetime, timedelta
from urllib.parse import quote, urlparse
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

ROOT = 'https://shigeyuki.pythonanywhere.com'
ET = ZoneInfo('America/New_York')
HEADERS = {'User-Agent': 'MinimalPomoStudyBoard/1.0 (public Anki user profile statistics)'}


def key(value: str) -> str:
    return unicodedata.normalize('NFKC', str(value)).casefold().strip()


def compact(value: str) -> str:
    return re.sub(r'\s+', ' ', str(value)).strip()


def number(value: str):
    match = re.search(r'(?<!\d)\d[\d,]*', compact(value))
    return int(match.group().replace(',', '')) if match else None


def decimal(value: str):
    match = re.search(r'(?<!\d)\d[\d,]*(?:\.\d+)?', compact(value))
    return float(match.group().replace(',', '')) if match else None


def percent(value: str):
    match = re.search(r'(\d{1,3}(?:\.\d+)?)\s*%', compact(value))
    return float(match.group(1)) if match else None


def minutes(value: str):
    raw = compact(value).lower()
    h = re.search(r'(\d+(?:\.\d+)?)\s*(?:h|hours?)\b', raw)
    m = re.search(r'(\d+(?:\.\d+)?)\s*(?:m|min|minutes?)\b', raw)
    if h or m:
        return round((float(h.group(1)) if h else 0) * 60 +
                     (float(m.group(1)) if m else 0), 1)
    return decimal(raw)


def fetch(session: requests.Session, url: str) -> BeautifulSoup:
    """Limited retry/backoff; never follow off-domain redirects."""
    last_error = None
    for attempt in range(3):
        try:
            response = session.get(url, timeout=25)
            response.raise_for_status()
            if urlparse(response.url).hostname != urlparse(ROOT).hostname:
                raise ValueError('Unexpected external redirect')
            if len(response.content) > 2_000_000:
                raise ValueError('Unexpectedly large profile response')
            return BeautifulSoup(response.text, 'html.parser')
        except (requests.RequestException, ValueError) as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(2 + attempt * 3)
    raise RuntimeError(f'Unable to load Anki profile: {last_error}')


def parse_profile(soup: BeautifulSoup, username: str) -> dict:
    """Parse exact profile labels; never confuse today's reviews with past 31 days."""
    item = {
        'username': username, 'reviews': None, 'minutes': None,
        'streak': None, 'retention': None, 'reviews_31d': None,
        'country': None, 'league': None, 'anki_group': None,
        'review_rank': None,
    }
    title = soup.find('h1')
    if not title or key(compact(title.get_text(' ', strip=True))) != key(username):
        raise ValueError('Profile name mismatch or no public profile for username')
    labels = {
        'reviews': ('reviews', number),
        'minutes': ('minutes', minutes),
        'streak': ('streak', number),
        'retention': ('retention', percent),
        'reviews past 31 days': ('reviews_31d', number),
        'country': ('country', compact),
        'league': ('league', compact),
        'group': ('anki_group', compact),
    }
    for row in soup.find_all('tr'):
        cells = row.find_all(['td', 'th'], recursive=False)
        if len(cells) < 2:
            continue
        label = key(compact(cells[0].get_text(' ', strip=True))).rstrip(':')
        if label not in labels:
            continue
        field, converter = labels[label]
        val = converter(cells[1].get_text(' ', strip=True))
        if isinstance(val, str) and val in ('', '-', '—'):
            val = None
        item[field] = val
    if all(item[k] is None for k in ('reviews', 'minutes', 'streak', 'retention')):
        raise ValueError('Profile did not have readable statistics')
    return item


def scrape(usernames: list[str]) -> list[dict]:
    """Read each participant's actual /user/<username>/ profile directly."""
    output = []
    with requests.Session() as session:
        session.headers.update(HEADERS)
        for username in usernames:
            target = f'{ROOT}/user/{quote(username, safe="")}/'
            try:
                row = parse_profile(fetch(session, target), username)
                output.append(row)
                print(f'Parsed profile for {username}: today={row["reviews"]}, '
                      f'past31={row["reviews_31d"]}, minutes={row["minutes"]}')
            except (ValueError, RuntimeError) as exc:
                print(f'WARNING: No valid profile for {username}: {exc}')
    if not output:
        raise RuntimeError('No valid Anki profiles; preserving prior Supabase data.')
    return output


def credentials():
    url = os.environ.get('SUPABASE_URL', '').rstrip('/')
    key_value = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not url or not key_value:
        raise RuntimeError('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
    return url, key_value


def api_session(secret: str) -> requests.Session:
    session = requests.Session()
    session.headers.update({
        'apikey': secret, 'Authorization': f'Bearer {secret}',
        'Content-Type': 'application/json',
    })
    return session


def load_registrations() -> list[dict]:
    """Discover Anki usernames from Settings; preserve board membership."""
    base, secret = credentials()
    found = {}
    with api_session(secret) as session:
        page_size = 500
        for offset in range(0, 5000, page_size):
            response = session.get(f'{base}/rest/v1/pomo_anki_registrations', params={
                'select': 'board_key,study_name_key,anki_username',
                'order': 'anki_username.asc',
                'limit': str(page_size), 'offset': str(offset),
            }, timeout=30)
            response.raise_for_status()
            records = response.json()
            if not isinstance(records, list):
                raise RuntimeError('Unexpected Supabase registration response')
            for record in records:
                username = compact(record.get('anki_username') or '')
                board = str(record.get('board_key') or '')
                study = str(record.get('study_name_key') or '')
                if username and board and study:
                    found[(board, study)] = {
                        'board_key': board, 'study_name_key': study,
                        'anki_username': username,
                    }
            if len(records) < page_size:
                break
    result = list(found.values())
    print(f'Found {len(result)} opted-in Anki registrations.')
    return result


def post_to_supabase(rows: list[dict], day: str) -> None:
    base, secret = credentials()
    now_iso = datetime.now(ZoneInfo('UTC')).isoformat()
    payload = [{**r, 'anki_day': day, 'captured_at': now_iso} for r in rows]
    # A bad scrape must not erase earlier valid metrics from today's stored row.
    fields = ('reviews', 'minutes', 'streak', 'retention', 'reviews_31d',
              'country', 'league', 'anki_group', 'review_rank')
    with api_session(secret) as session:
        endpoint = f'{base}/rest/v1/pomo_anki_snapshots'
        prior_response = session.get(endpoint, params={
            'select': 'username,' + ','.join(fields),
            'anki_day': f'eq.{day}',
        }, timeout=30)
        prior_response.raise_for_status()
        previous = {key(r['username']): r for r in prior_response.json()}
        for item in payload:
            saved = previous.get(key(item['username']), {})
            for field in fields:
                if item.get(field) is None:
                    item[field] = saved.get(field)
        response = session.post(
            f'{endpoint}?on_conflict=anki_day,username',
            headers={'Prefer': 'resolution=merge-duplicates,return=minimal'},
            json=payload, timeout=35)
        if not response.ok:
            raise RuntimeError(f'Anki stats save failed ({response.status_code}): {response.text[:500]}')
    print(f'Saved {len(payload)} user snapshots for {day}, captured {now_iso}.')


def save_daily_members(registrations: list[dict], day: str) -> None:
    base, secret = credentials()
    rows = [{**registration, 'anki_day': day} for registration in registrations]
    if not rows:
        return
    with api_session(secret) as session:
        for pos in range(0, len(rows), 250):
            response = session.post(
                f'{base}/rest/v1/pomo_anki_daily_members'
                '?on_conflict=anki_day,board_key,study_name_key',
                headers={'Prefer': 'resolution=merge-duplicates,return=minimal'},
                json=rows[pos:pos + 250], timeout=35)
            if not response.ok:
                raise RuntimeError(f'Historical membership save failed ({response.status_code}): {response.text[:500]}')
    print(f'Saved historical membership for {len(rows)} registrations on {day}.')


def anki_day(local: datetime) -> str:
    return (local - timedelta(hours=4)).date().isoformat()


def main() -> None:
    started = datetime.now(ET)
    day = anki_day(started)
    print('Anki day:', day, 'time ET:', started.strftime('%Y-%m-%d %I:%M %p %Z'))
    registrations = load_registrations()
    if not registrations:
        print('No registered Anki usernames to collect.')
        return
    by_name = {key(r['anki_username']): r['anki_username'] for r in registrations}
    rows = scrape(list(by_name.values()))
    if anki_day(datetime.now(ET)) != day:
        print('Anki day rolled over while fetching profiles; discarding ambiguous capture.')
        return
    post_to_supabase(rows, day)
    save_daily_members(registrations, day)
    print('Sorted by today’s reviews in the Discord display; 31-day data stored separately.')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
