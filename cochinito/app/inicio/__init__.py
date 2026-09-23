from flask import Blueprint, render_template
from app.auth import login_required
bp = Blueprint('inicio', __name__)
@bp.get('/')
@login_required
def index():
    return render_template('placeholder.html', title='Inicio')
