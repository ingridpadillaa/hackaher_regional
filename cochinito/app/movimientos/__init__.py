from flask import Blueprint, render_template
from app.auth import login_required
bp = Blueprint('movimientos', __name__)
@bp.get('/movimientos')
@login_required
def index():
    return render_template('placeholder.html', title='Movimientos')
