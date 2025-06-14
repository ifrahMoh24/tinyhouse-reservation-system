import pymysql
from flask import current_app, g
import logging

def get_db():
    """Veritabanı bağlantısını al"""
    if 'db' not in g:
        try:
            g.db = pymysql.connect(
                host=current_app.config['DB_HOST'],
                user=current_app.config['DB_USER'],
                password=current_app.config['DB_PASSWORD'],
                database=current_app.config['DB_NAME'],
                charset='utf8mb4',
                cursorclass=pymysql.cursors.DictCursor,
                autocommit=True
            )
        except Exception as e:
            logging.error(f"Database connection failed: {e}")
            raise e
    return g.db

def close_db(e=None):
    """Veritabanı bağlantısını kapat"""
    db = g.pop('db', None)
    if db is not None:
        db.close()

def execute_query(query, params=None, fetch_one=False, fetch_all=True):
    """SQL sorgusu çalıştır"""
    db = get_db()
    try:
        with db.cursor() as cursor:
            cursor.execute(query, params or ())
            
            if query.strip().upper().startswith('SELECT'):
                if fetch_one:
                    return cursor.fetchone()
                elif fetch_all:
                    return cursor.fetchall()
            else:
                db.commit()
                return {
                    'affected_rows': cursor.rowcount,
                    'last_insert_id': cursor.lastrowid if cursor.lastrowid else None
                }
    except Exception as e:
        db.rollback()
        logging.error(f"Database query error: {e}")
        raise e