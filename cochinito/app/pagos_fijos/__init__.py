from flask import Blueprint, render_template
from app.auth import login_required
bp = Blueprint('pagos_fijos', __name__)
@bp.get('/pagos-fijos')
@login_required
def index():
    return render_template('placeholder.html', title='Pagos Fijos')
