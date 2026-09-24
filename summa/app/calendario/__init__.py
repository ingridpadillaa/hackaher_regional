from flask import Blueprint, abort, g, render_template, request

from app.auth import login_required
from app.services.firestore_repo import repo, visible_movements
from app.services.seasonal import estimate, upcoming

bp = Blueprint("calendario", __name__, url_prefix="/calendario")


@bp.get("")
@login_required
def index():
    household = repo().get(f"hogares/{g.hogar_id}")
    events = upcoming(
        repo().list("eventosTemporada"), household, visible_movements(g.hogar_id, g.user["uid"])
    )
    month = request.args.get("mes", "")
    if month:
        events = [e for e in events if e["fechaInicio"][5:7] == month]
    return render_template("calendar.html", events=events, event=None)


@bp.get("/<event_id>")
@login_required
def detail(event_id):
    event = repo().get("eventosTemporada/" + event_id)
    if not event:
        abort(404)
    item = estimate(
        dict(event, id=event_id),
        repo().get(f"hogares/{g.hogar_id}"),
        visible_movements(g.hogar_id, g.user["uid"]),
    )
    return render_template("calendar.html", events=[], event=item)
