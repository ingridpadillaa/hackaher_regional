import argparse

from app import create_app
from app.services.profeco_etl import sync_prices

parser = argparse.ArgumentParser()
parser.add_argument("--file")
args = parser.parse_args()
app = create_app()
with app.app_context():
    print(sync_prices(app.extensions["repo"], args.file))
