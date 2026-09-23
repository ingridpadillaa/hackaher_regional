from flask import Blueprint, render_template
from app.auth import login_required
bp = Blueprint('jobs', __name__)
@bp.get('/jobs')
@login_required
def index():
    return render_template('placeholder.html', title='Jobs')
