import os
from pathlib import Path

from flask import Flask
from flask_cors import CORS

def create_app():
    app = Flask(__name__, static_folder='../static')
    # 允许所有域名跨域，允许携带 cookie/token 等凭证
    CORS(app, supports_credentials=True)
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
  
