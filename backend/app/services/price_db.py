import sqlite3
from pathlib import Path

COLUMNS = "producto_id producto presentacion marca categoria cadena tienda direccion estado municipio lat lng precio fecha".split()


def database_path(repository=None):
    if repository and repository.testing:
        return Path(repository.path).parent / "precios.db"
    return Path(__file__).resolve().parents[2] / "data/precios.db"


def connect(repository=None):
    path = database_path(repository)
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.execute(
        "CREATE TABLE IF NOT EXISTS precios_profeco (producto_id TEXT,producto TEXT,presentacion TEXT,marca TEXT,categoria TEXT,cadena TEXT,tienda TEXT,direccion TEXT,estado TEXT,municipio TEXT,lat REAL,lng REAL,precio REAL,fecha TEXT, PRIMARY KEY(producto_id,tienda,direccion,municipio))"
    )
    db.execute(
        "CREATE TABLE IF NOT EXISTS profeco_meta (huella TEXT PRIMARY KEY,fecha TEXT,filas INTEGER,errores TEXT)"
    )
    for key in ("producto_id", "cadena", "municipio"):
        db.execute(f"CREATE INDEX IF NOT EXISTS idx_{key} ON precios_profeco({key})")
    return db


def prices(repository, query=None):
    if not database_path(repository).exists():
        return []
    from contextlib import closing

    with closing(connect(repository)) as db:
        if query:
            rows = db.execute(
                "SELECT * FROM precios_profeco WHERE producto LIKE ? LIMIT 50", ("%" + query + "%",)
            ).fetchall()
        else:
            rows = db.execute("SELECT * FROM precios_profeco").fetchall()
    return [dict(row, fuente="profeco") for row in rows]
