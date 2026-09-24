"""Only persistence boundary. SQLite is an explicitly local demo backend."""

import json
import sqlite3
import uuid
from contextlib import contextmanager
from pathlib import Path


class Repository:
    def __init__(self, app):
        self.remote = app.config["DATA_BACKEND"] == "firestore"
        if self.remote:
            from firebase_admin import firestore

            self.db = firestore.client()
        else:
            if not app.config["DEMO_MODE"]:
                raise RuntimeError("Producción requiere Firestore")
            Path(app.instance_path).mkdir(parents=True, exist_ok=True)
            self.path = app.config.get("DATABASE", str(Path(app.instance_path) / "demo.sqlite"))
            with self.connection() as conn:
                conn.execute("CREATE TABLE IF NOT EXISTS docs (path TEXT PRIMARY KEY, value TEXT NOT NULL)")

    @contextmanager
    def connection(self):
        conn = sqlite3.connect(self.path, timeout=15)
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def get(self, path):
        if self.remote:
            return self.db.document(path).get().to_dict()
        with self.connection() as conn:
            row = conn.execute("SELECT value FROM docs WHERE path=?", (path,)).fetchone()
            return json.loads(row[0]) if row else None

    def put(self, path, value):
        if self.remote:
            self.db.document(path).set(value)
        else:
            with self.connection() as conn:
                conn.execute("INSERT OR REPLACE INTO docs VALUES (?,?)", (path, json.dumps(value)))
        return value

    def delete(self, path):
        if self.remote:
            self.db.document(path).delete()
        else:
            with self.connection() as conn:
                conn.execute("DELETE FROM docs WHERE path=?", (path,))

    def list(self, collection):
        if self.remote:
            return [dict(doc.to_dict(), id=doc.id) for doc in self.db.collection(collection).stream()]
        prefix = collection + "/"
        with self.connection() as conn:
            rows = conn.execute("SELECT path,value FROM docs WHERE path LIKE ?", (prefix + "%",)).fetchall()
        return [
            dict(json.loads(value), id=path[len(prefix) :])
            for path, value in rows
            if "/" not in path[len(prefix) :]
        ]

    def atomic(self, paths, update):
        """Read all declared documents before transactional writes; safe across workers."""
        if self.remote:
            from firebase_admin import firestore

            @firestore.transactional
            def run(transaction):
                current = {p: self.db.document(p).get(transaction=transaction).to_dict() for p in paths}
                changes, result = update(current)
                for path, value in changes.items():
                    if value is None:
                        transaction.delete(self.db.document(path))
                    else:
                        transaction.set(self.db.document(path), value)
                return result

            return run(self.db.transaction())
        with self.connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            current = {}
            for path in paths:
                row = conn.execute("SELECT value FROM docs WHERE path=?", (path,)).fetchone()
                current[path] = json.loads(row[0]) if row else None
            changes, result = update(current)
            for path, value in changes.items():
                if value is None:
                    conn.execute("DELETE FROM docs WHERE path=?", (path,))
                else:
                    conn.execute("INSERT OR REPLACE INTO docs VALUES (?,?)", (path, json.dumps(value)))
            return result

    def batch_put(self, documents):
        if len(documents) > 400:
            raise ValueError("A batch supports at most 400 documents")
        if self.remote:
            batch = self.db.batch()
            for path, value in documents.items():
                batch.set(self.db.document(path), value)
            batch.commit()
        else:
            with self.connection() as conn:
                conn.executemany(
                    "INSERT OR REPLACE INTO docs VALUES (?,?)",
                    [(p, json.dumps(v)) for p, v in documents.items()],
                )

    def add(self, collection, value):
        doc_id = uuid.uuid4().hex
        self.put(f"{collection}/{doc_id}", value)
        return doc_id


def repo():
    from flask import current_app

    return current_app.extensions["repo"]


def household_path(household_id, collection=""):
    return f"hogares/{household_id}" + (f"/{collection}" if collection else "")


def visible_movements(household_id, uid):
    return [
        m
        for m in repo().list(household_path(household_id, "movimientos"))
        if not m.get("privado") or m.get("integranteId") == uid
    ]
