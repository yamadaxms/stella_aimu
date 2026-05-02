import json
import os
from decimal import Decimal
from pathlib import Path

import psycopg2
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from psycopg2 import sql
from psycopg2.extras import RealDictCursor


ROOT_DIR = Path(__file__).resolve().parent.parent

application = Flask(__name__, static_folder=None)

cors_origins = [origin.strip() for origin in os.environ.get("CORS_ORIGINS", "*").split(",") if origin.strip()]
CORS(application, resources={r"/api/*": {"origins": cors_origins or "*"}})


class DataShapeError(RuntimeError):
    pass


def get_conn():
    return psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=os.environ.get("DB_PORT", "5432"),
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
    )


def query_rows(conn, query, params=None):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query, params or ())
        return cur.fetchall()


def get_table_columns(conn, table_name):
    rows = query_rows(
        conn,
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
        """,
        (table_name,),
    )
    return {row["column_name"] for row in rows}


def find_table(conn, candidates):
    for table in candidates:
        columns = get_table_columns(conn, table)
        if columns:
            return table, columns
    return None, set()


def first_column(columns, candidates):
    return next((column for column in candidates if column in columns), None)


def parse_json_value(value, default):
    if value is None:
        return default
    if isinstance(value, (list, dict)):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return default
        try:
            return json.loads(stripped)
        except json.JSONDecodeError:
            return [item.strip() for item in stripped.split(",") if item.strip()]
    return value


def to_float(value):
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def to_star_key(value, source_column):
    if value is None:
        return None
    if source_column in {"hip", "hip_id", "hip_number"}:
        return f"HIP_{value}"
    return str(value)


def select_rows(conn, table, columns, selected_columns, published_column=None, order_column=None):
    identifiers = [sql.Identifier(column) for column in selected_columns]
    query = sql.SQL("SELECT {fields} FROM {table}").format(
        fields=sql.SQL(", ").join(identifiers),
        table=sql.Identifier(table),
    )
    if published_column:
        query += sql.SQL(" WHERE {} = true").format(sql.Identifier(published_column))
    if order_column:
        query += sql.SQL(" ORDER BY {}").format(sql.Identifier(order_column))

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query)
        return cur.fetchall()


def fetch_stars(conn):
    table, columns = find_table(conn, ("star", "stars"))
    if not table:
        raise DataShapeError("star/stars table is required for HIP coordinate data.")

    key_column = first_column(columns, ("hip_key", "key", "code", "hip", "hip_id", "hip_number", "star_id", "id"))
    ra_column = first_column(columns, ("ra", "ra_deg", "right_ascension"))
    dec_column = first_column(columns, ("dec", "dec_deg", "declination"))
    if not key_column or not ra_column or not dec_column:
        raise DataShapeError(f"{table} table must contain key, ra, and dec columns.")

    rows = select_rows(conn, table, columns, [key_column, ra_column, dec_column], order_column=key_column)
    stars = {}
    for row in rows:
        key = to_star_key(row.get(key_column), key_column)
        ra = to_float(row.get(ra_column))
        dec = to_float(row.get(dec_column))
        if key and ra is not None and dec is not None:
            stars[key] = {"ra": ra, "dec": dec}
    return stars


def fetch_constellations(conn):
    table, columns = find_table(conn, ("star_culture", "star_cultures", "constellation", "constellations"))
    if not table:
        raise DataShapeError("star_culture/constellation table is required for star culture definitions.")

    key_column = first_column(columns, ("key", "code", "star_culture_key", "star_culture_id", "constellation_id", "id"))
    name_column = first_column(columns, ("name", "name_ja", "title", "title_ja"))
    description_column = first_column(columns, ("description", "description_ja", "body", "body_ja"))
    ra_column = first_column(columns, ("ra", "ra_deg", "label_ra"))
    dec_column = first_column(columns, ("dec", "dec_deg", "label_dec"))
    lines_column = first_column(columns, ("lines", "line_segments", "star_lines"))
    aynu_column = first_column(columns, ("aynu", "aynu_codes", "culture_areas", "area_codes"))
    published_column = "is_published" if "is_published" in columns else None

    if not key_column or not name_column:
        raise DataShapeError(f"{table} table must contain key/id and name/name_ja columns.")

    selected_columns = [
        column
        for column in (key_column, name_column, description_column, ra_column, dec_column, lines_column, aynu_column)
        if column
    ]
    rows = select_rows(conn, table, columns, selected_columns, published_column=published_column, order_column=key_column)

    constellations = []
    for row in rows:
        constellations.append(
            {
                "key": str(row.get(key_column)),
                "ra": to_float(row.get(ra_column)) if ra_column else None,
                "dec": to_float(row.get(dec_column)) if dec_column else None,
                "name": row.get(name_column) or "",
                "description": row.get(description_column) if description_column else "",
                "lines": parse_json_value(row.get(lines_column), []) if lines_column else [],
                "aynu": parse_json_value(row.get(aynu_column), []) if aynu_column else [],
            }
        )
    return constellations


def aynu_codes_to_area_keys(codes):
    mapping = {
        "aynu1": "area1",
        "aynu2": "area2",
        "aynu3": "area3",
        "aynu4": "area4",
        "aynu5": "area5",
    }
    keys = []
    for code in parse_json_value(codes, []):
        key = mapping.get(str(code))
        if key and key not in keys:
            keys.append(key)
    return keys


def fetch_city_map(conn):
    table, columns = find_table(conn, ("city", "cities", "municipality", "municipalities"))
    if not table:
        raise DataShapeError("city/cities table is required for municipality area data.")

    city_column = first_column(columns, ("city", "name", "name_ja", "municipality"))
    forecast_column = first_column(columns, ("forecast", "forecast_area"))
    region_column = first_column(columns, ("area", "region"))
    bureau_column = first_column(columns, ("subprefecture", "bureau", "district"))
    lat_column = first_column(columns, ("lat", "latitude"))
    lon_column = first_column(columns, ("lon", "lng", "longitude"))
    aynu_column = first_column(columns, ("aynu", "aynu_codes", "culture_areas", "area_codes"))
    area_key_column = first_column(columns, ("area_key", "area_keys"))

    if not city_column:
        raise DataShapeError(f"{table} table must contain city/name column.")

    selected_columns = [
        column
        for column in (
            city_column,
            forecast_column,
            region_column,
            bureau_column,
            lat_column,
            lon_column,
            aynu_column,
            area_key_column,
        )
        if column
    ]
    rows = select_rows(conn, table, columns, selected_columns, order_column=city_column)

    city_map = {}
    for row in rows:
        city_name = row.get(city_column)
        if not city_name:
            continue

        area_keys = parse_json_value(row.get(area_key_column), []) if area_key_column else aynu_codes_to_area_keys(row.get(aynu_column))
        if isinstance(area_keys, str):
            area_keys = [area_keys]

        entry = {
            "forecast": row.get(forecast_column) if forecast_column else None,
            "region": row.get(region_column) if region_column else None,
            "bureau": row.get(bureau_column) if bureau_column else None,
            "lat": to_float(row.get(lat_column)) if lat_column else None,
            "lon": to_float(row.get(lon_column)) if lon_column else None,
        }
        if len(area_keys) > 1:
            entry["areas"] = area_keys
        elif len(area_keys) == 1:
            entry["area"] = area_keys[0]

        city_map[str(city_name)] = entry

    return city_map


@application.route("/")
def index():
    return send_from_directory(ROOT_DIR, "index.html")


@application.route("/api/health")
def health():
    return jsonify({"ok": True})


@application.route("/api/star-cultures")
def get_star_cultures():
    try:
        with get_conn() as conn:
            return jsonify(
                {
                    "stars": fetch_stars(conn),
                    "constellations": fetch_constellations(conn),
                    "cityMap": fetch_city_map(conn),
                }
            )
    except DataShapeError as exc:
        return jsonify({"error": str(exc)}), 500
    except KeyError as exc:
        return jsonify({"error": f"Missing required environment variable: {exc.args[0]}"}), 500
    except psycopg2.Error as exc:
        return jsonify({"error": "Database query failed", "detail": str(exc)}), 500


@application.route("/<path:path>")
def static_files(path):
    target = ROOT_DIR / path
    if target.is_file():
        return send_from_directory(ROOT_DIR, path)
    return send_from_directory(ROOT_DIR, "index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    application.run(host="0.0.0.0", port=port)
