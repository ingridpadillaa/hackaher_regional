from flask import Blueprint, render_template
from app.auth import login_required
bp = Blueprint('perfil', __name__)
@bp.get('/perfil')
@login_required
def index():
    return render_template('placeholder.html', title='Perfil')
