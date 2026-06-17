from flask import Blueprint

api_bp = Blueprint('api', __name__)

from . import routes
from . import auth_routes
from . import paste_routes
from . import manage_routes
