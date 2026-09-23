from flask import Blueprint, render_template
from app.auth import login_required
bp = Blueprint('copiloto', __name__)
@bp.get('/copiloto')
@login_required
def index():
    return render_template('placeholder.html', title='Copiloto')
