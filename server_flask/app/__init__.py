from pathlib import Path

from flask import Flask

def create_app():
    app = Flask(__name__, static_folder='../static')
    app.config["CONTENT_ROOT"] = Path(__file__).resolve().parents[2] / "content"

    from .api import api_bp
    app.register_blueprint(api_bp, url_prefix='/api')

    return app
  
