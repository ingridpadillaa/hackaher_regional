from flask import Blueprint, render_template
from app.auth import login_required
bp = Blueprint('mandado', __name__)
@bp.get('/mandado')
@login_required
def index():
    return render_template('placeholder.html', title='Mandado')
