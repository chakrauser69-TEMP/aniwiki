#!/usr/bin/env python3
"""
AnimeWiki Auto-Update Script
Fetches latest anime data from Jikan API (unofficial MyAnimeList API)
and regenerates data.js for the website.

Usage:
    python3 update_data.py              # Update with default settings
    python3 update_data.py --pages 10   # Fetch 10 pages (250 anime)
    python3 update_data.py --full       # Full update (all pages, ~6000 anime)

Schedule with Termux:
    termux-job-scheduler or cron to run weekly
"""

import json
import time
import urllib.request
import urllib.error
import os
import sys
from datetime import datetime

JIKAN_BASE = "https://api.jikan.moe/v4"
OUTPUT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.js")
REQUEST_DELAY = 1.5
MAX_RETRIES = 3


def fetch_json(url, retries=MAX_RETRIES):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "AnimeWiki-Updater/1.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = int(e.headers.get("Retry-After", 5))
                print(f"  Rate limited, waiting {wait}s...")
                time.sleep(wait)
            else:
                print(f"  HTTP {e.code}, retrying...")
                time.sleep(REQUEST_DELAY * (attempt + 1))
        except Exception as e:
            print(f"  Error: {e}, retrying...")
            time.sleep(REQUEST_DELAY * (attempt + 1))
    return None


def fetch_top_anime(pages=5):
    all_anime = []
    for page in range(1, pages + 1):
        print(f"Fetching top anime page {page}/{pages}...")
        data = fetch_json(f"{JIKAN_BASE}/top/anime?page={page}&limit=25")
        if not data or "data" not in data:
            print(f"  No data returned for page {page}")
            break
        all_anime.extend(data["data"])
        print(f"  Got {len(data['data'])} entries (total: {len(all_anime)})")
        if page < pages:
            time.sleep(REQUEST_DELAY)
    return all_anime


def fetch_seasonal_anime(year=None, season=None):
    now = datetime.now()
    if year is None:
        year = now.year
    if season is None:
        month = now.month
        if month <= 3:
            season = "winter"
        elif month <= 6:
            season = "spring"
        elif month <= 9:
            season = "summer"
        else:
            season = "fall"
    print(f"Fetching seasonal anime: {season} {year}...")
    data = fetch_json(f"{JIKAN_BASE}/seasons/{year}/{season}")
    if data and "data" in data:
        print(f"  Got {len(data['data'])} seasonal entries")
        return data["data"]
    return []


def fetch_anime_details(mal_id):
    data = fetch_json(f"{JIKAN_BASE}/anime/{mal_id}/full")
    if data and "data" in data:
        return data["data"]
    return None


def parse_anime(entry):
    genres = [g["name"] for g in entry.get("genres", [])]
    themes = [g["name"] for g in entry.get("themes", [])]
    demographics = [g["name"] for g in entry.get("demographics", [])]
    studios = [s["name"] for s in entry.get("studios", [])]
    producers = [p["name"] for p in entry.get("producers", [])]

    images = entry.get("images", {})
    jpg = images.get("jpg", {})
    img_url = jpg.get("large_image_url") or jpg.get("image_url") or None

    trailer = entry.get("trailer", {})
    trailer_id = trailer.get("youtube_id") or None

    aired = entry.get("aired", {})
    aired_from = aired.get("from", None) if isinstance(aired, dict) else None
    aired_to = aired.get("to", None) if isinstance(aired, dict) else None

    year = entry.get("year")
    if not year and aired_from:
        try:
            year = int(aired_from[:4])
        except (ValueError, TypeError):
            pass

    season = entry.get("season")
    if not season and aired_from:
        try:
            month = int(aired_from[5:7])
            if month <= 3:
                season = "winter"
            elif month <= 6:
                season = "spring"
            elif month <= 9:
                season = "summer"
            else:
                season = "fall"
        except (ValueError, TypeError):
            pass

    synopsis = entry.get("synopsis", "")

    return {
        "id": entry.get("mal_id"),
        "title": entry.get("title", ""),
        "title_en": entry.get("title_english") or None,
        "title_jp": entry.get("title_japanese") or None,
        "img": img_url,
        "type": entry.get("type"),
        "episodes": entry.get("episodes"),
        "score": entry.get("score"),
        "rank": entry.get("rank"),
        "popularity": entry.get("popularity"),
        "members": entry.get("members"),
        "favorites": entry.get("favorites"),
        "synopsis": synopsis or None,
        "status": entry.get("status"),
        "rating": entry.get("rating"),
        "season": season,
        "year": year,
        "genres": genres or [],
        "themes": themes or [],
        "demographics": demographics or [],
        "studios": studios or [],
        "producers": producers or [],
        "aired_from": aired_from,
        "aired_to": aired_to,
        "trailer_youtube": trailer_id,
    }


def merge_data(existing, new_entries):
    existing_map = {a["id"]: a for a in existing}
    for entry in new_entries:
        if entry["id"] in existing_map:
            old = existing_map[entry["id"]]
            for key, val in entry.items():
                if val is not None and val != "" and val != []:
                    old[key] = val
        else:
            existing_map[entry["id"]] = entry
    return sorted(existing_map.values(), key=lambda a: -(a.get("members") or 0))


def main():
    pages = 5
    full = False
    if "--full" in sys.argv:
        full = True
        pages = 24
    elif "--pages" in sys.argv:
        idx = sys.argv.index("--pages")
        if idx + 1 < len(sys.argv):
            pages = int(sys.argv[idx + 1])

    print("=" * 50)
    print("AnimeWiki Data Updater")
    print("=" * 50)

    existing = []
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            content = f.read()
            try:
                start = content.index("[")
                end = content.rindex("]") + 1
                existing = json.loads(content[start:end])
                print(f"Loaded {len(existing)} existing entries")
            except (ValueError, json.JSONDecodeError):
                print("Could not parse existing data, starting fresh")

    new_entries = fetch_top_anime(pages)
    seasonal = fetch_seasonal_anime()
    new_entries.extend(seasonal)

    seen_ids = set()
    unique_entries = []
    for e in new_entries:
        if e["mal_id"] not in seen_ids:
            seen_ids.add(e["mal_id"])
            unique_entries.append(e)

    print(f"\nParsing {len(unique_entries)} unique entries...")
    parsed = [parse_anime(e) for e in unique_entries]
    parsed = [p for p in parsed if p["title"] and p.get("synopsis")]

    print("Merging with existing data...")
    merged = merge_data(existing, parsed)

    print(f"\nWriting {len(merged)} entries to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("const ANIME_DATA = ")
        json.dump(merged, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    size_mb = os.path.getsize(OUTPUT_FILE) / 1024 / 1024
    print(f"Done! {len(merged)} entries, {size_mb:.1f} MB")
    print(f"Updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


if __name__ == "__main__":
    main()
