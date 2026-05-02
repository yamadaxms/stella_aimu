import os
import psycopg2
from flask import Flask, jsonify
from flask_cors import CORS

application = Flask(__name__)
CORS(application)

def get_conn():
    return psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=os.environ.get("DB_PORT", "5432"),
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"]
    )

@application.route("/api/star-cultures")
def get_star_cultures():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        SELECT star_culture_id, name_ja
        FROM star_culture
        WHERE is_published = true
    """)

    rows = cur.fetchall()

    cur.close()
    conn.close()

    return jsonify([
        {
            "id": r[0],
            "name_ja": r[1]
        }
        for r in rows
    ])