import os
from pathlib import Path

from flask import Flask

def create_app():
    app = Flask(__name__, static_folder='../static')
    default_content_root = Path(__file__).resolve().parents[2] / "content"
    content_root = os.environ.get("BLOG_CONTENT_ROOT")
    app.config["CONTENT_ROOT"] = (
        Path(content_root).expanduser().resolve()
        if content_root
        else default_content_root
    )

    from .api import api_bp
    app.register_blueprint(api_bp, url_prefix='/api')

    return app
  
